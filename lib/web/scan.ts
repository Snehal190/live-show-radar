import "server-only";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { geminiJson, type GroundingSource } from "@/lib/ai/gemini";
import { webScanPrompt } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { artists, rumours } from "@/lib/db/schema";
import { hasGemini } from "@/lib/env";
import { aliasMatches } from "@/lib/logic/alias";
import { detectCity } from "@/lib/logic/city";
import { normalize } from "@/lib/logic/text";
import { getMeta, setMeta } from "@/lib/server/meta";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { withTimeout } from "@/lib/server/timeout";
import { mergeFind } from "@/lib/serp/merge";
import { addIstDays, fromIst, istDate } from "@/lib/time";

const Find = z.object({
  artist: z.string(),
  event_name: z.string().default(""),
  event_type: z.enum(["Concert", "Festival"]).catch("Concert"),
  city: z.string().nullable().default(null),
  venue: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  time: z.string().nullable().default(null),
  ticket_platform: z.string().nullable().default(null),
  early_bird_deadline: z.string().nullable().default(null),
  early_bird_price_inr: z.number().nullable().default(null),
  general_price_inr: z.number().nullable().default(null),
  source_url: z.string().nullable().default(null),
});
const Finds = z.array(Find);

export interface WebScanSummary {
  skipped?: string;
  artists: string[];
  finds: number;
  accepted: number;
  newShows: number;
  rumours: number;
}

const PER_RUN = 3;

/** Grounding chunks point at vertexaisearch redirect URLs; resolve them to the real page. */
async function resolveSource(uri: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/.test(uri)) return uri;
  try {
    return await withTimeout("resolve grounding url", 6_000, async (signal) => {
      const res = await fetch(uri, { method: "HEAD", redirect: "manual", signal });
      return res.headers.get("location") ?? uri;
    });
  } catch {
    return uri;
  }
}

function host(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Pick the grounding source that backs a find: same host as the URL the model cited, else none. */
export function matchGroundedSource(cited: string | null, sources: readonly string[]): string | null {
  if (!cited) return null;
  const h = host(cited);
  if (!h) return null;
  const exact = sources.find((s) => s.replace(/\/$/, "") === cited.replace(/\/$/, ""));
  if (exact) return exact;
  const sameHost = sources.find((s) => host(s) === h);
  return sameHost ? cited : null;
}

export async function runWebScan(now = new Date()): Promise<WebScanSummary> {
  const db = getDb();
  const all = await db.select().from(artists).orderBy(asc(artists.id));
  const ordered = [...all.filter((a) => a.priority === "Must-see"), ...all.filter((a) => a.priority !== "Must-see")];
  const cursor = Number((await getMeta(["web_scan_cursor"])).web_scan_cursor ?? 0) % Math.max(1, ordered.length);
  const batch = Array.from({ length: Math.min(PER_RUN, ordered.length) }, (_, i) => ordered[(cursor + i) % ordered.length]);
  const summary: WebScanSummary = { artists: batch.map((a) => a.name), finds: 0, accepted: 0, newShows: 0, rumours: 0 };

  const logId = await startLog("gemini_web", { trigger: "cron", description: `Web scan: ${summary.artists.join(", ")}` });
  if (!hasGemini()) {
    await finishLog(logId, { error: "Gemini not configured" });
    return { ...summary, skipped: "Gemini not configured" };
  }
  try {
    const today = istDate(now);
    const res = await geminiJson({
      label: `web scan (grounded): ${summary.artists.join(", ")}`,
      prompt: webScanPrompt(batch.map((a) => ({ name: a.name, aliases: a.aliases })), today),
      schema: Finds,
      grounded: true,
      timeoutMs: 45_000,
      logKind: "gemini_web",
    });
    await setMeta("web_scan_cursor", String((cursor + PER_RUN) % ordered.length));
    if (!res.ok) {
      await finishLog(logId, { error: res.error });
      return { ...summary, skipped: res.error };
    }
    const sources = await Promise.all(res.sources.map((s: GroundingSource) => resolveSource(s.uri)));
    const horizon = addIstDays(today, 183);
    summary.finds = res.data.length;

    for (const f of res.data) {
      const artist = aliasMatches(f.artist, batch)[0] ?? aliasMatches(f.artist, all)[0];
      const loc = detectCity(f.city ? [f.city, "India"] : [], f.venue);
      const date = f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? f.date : null;
      const sourceUrl = matchGroundedSource(f.source_url, sources);
      let reason: string | null = null;
      if (!artist) reason = "artist not one of Karan's";
      else if (!loc.city) reason = "no city";
      else if (!date || date <= today || date > horizon) reason = "no future date within 6 months";
      else if (!sourceUrl) reason = f.source_url ? "cited URL not in grounding sources" : "no source URL";

      if (reason || !artist || !loc.city || !date || !sourceUrl) {
        const claim = `${f.artist}: ${f.event_name || "show"}${f.city ? ` in ${f.city}` : ""}`;
        const inserted = await db
          .insert(rumours)
          .values({ artistId: artist?.artistId ?? null, claim, city: f.city, dateText: f.date, reason: reason ?? "incomplete", dedupeKey: normalize(`${claim}|${f.date ?? ""}`) })
          .onConflictDoNothing()
          .returning({ id: rumours.id });
        summary.rumours += inserted.length;
        continue;
      }
      // Only keep an early-bird deadline when the source stated it (the prompt forbids guessing).
      const ebClosesAt = f.early_bird_deadline && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(f.early_bird_deadline) ? fromIst(...(f.early_bird_deadline.split(" ") as [string, string])) : null;
      const r = await mergeFind({
        artistId: artist.artistId,
        city: loc.city,
        date,
        time: f.time && /^\d{2}:\d{2}$/.test(f.time) ? f.time : null,
        eventName: f.event_name || `${f.artist} – Live`,
        eventType: f.event_type,
        venue: f.venue,
        sourceUrl,
        source: "gemini_web",
        ticketPlatform: f.ticket_platform,
        ebClosesAt: ebClosesAt && ebClosesAt > now ? ebClosesAt : null,
        ebPriceInr: f.early_bird_price_inr,
        generalPriceInr: f.general_price_inr,
        now,
      });
      summary.accepted++;
      if (r.created) summary.newShows++;
    }
    await setMeta("last_web_scan_at", now.toISOString());
    await finishLog(logId, { resultsCount: summary.finds, matchedCount: summary.accepted, newShowsCount: summary.newShows });
    return summary;
  } catch (e) {
    await finishLog(logId, { error: errorText(e) });
    throw e;
  }
}
