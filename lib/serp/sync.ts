import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { geminiJson } from "@/lib/ai/gemini";
import { MATCH_SYSTEM, matchUserPrompt } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { appMeta, artists, serpQueryPlan, serpRawEvents, syncLog } from "@/lib/db/schema";
import { eventsProvider, getEnv } from "@/lib/env";
import { aliasMatches } from "@/lib/logic/alias";
import { getMeta, setMeta } from "@/lib/server/meta";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { TimeoutError, withRetry, withTimeout } from "@/lib/server/timeout";
import { fromIst, istDate } from "@/lib/time";
import { cityFromQuery, isQueryDue, parseEvent, SerpResponse, type ParsedEvent } from "./parse";
import { mergeFind } from "./merge";
import { fromGoogleEventsBox, toSerpShape, type GoogleBoxEvent, type SearchApiEvent } from "./searchapi";

type PlanRow = typeof serpQueryPlan.$inferSelect;

export interface SerpSyncSummary {
  skipped?: string;
  queriesRun: number;
  results: number;
  inScope: number;
  matched: number;
  newShows: number;
  updatedShows: number;
  searchesUsed: number;
  quotaUsed: number;
  quotaLimit: number;
}

/** Monthly counter, reset when the IST month changes. */
async function quotaState(now: Date): Promise<{ used: number; limit: number }> {
  const month = istDate(now).slice(0, 7);
  const m = await getMeta(["serp_quota_month", "serp_searches_this_month"]);
  if (m.serp_quota_month !== month) {
    await setMeta("serp_quota_month", month);
    await setMeta("serp_searches_this_month", "0");
    return { used: 0, limit: getEnv().SERPAPI_MONTHLY_QUOTA };
  }
  return { used: Number(m.serp_searches_this_month ?? 0), limit: getEnv().SERPAPI_MONTHLY_QUOTA };
}

/** Atomic +1 that refuses to pass the quota. Returns false when the quota is exhausted. */
async function takeSearch(limit: number): Promise<boolean> {
  const rows = await getDb()
    .update(appMeta)
    .set({ value: sql`(${appMeta.value}::int + 1)::text`, updatedAt: new Date() })
    .where(and(eq(appMeta.key, "serp_searches_this_month"), sql`${appMeta.value}::int < ${limit}`))
    .returning({ v: appMeta.value });
  return rows.length > 0;
}

type Provider = "serpapi" | "searchapi";
type Fetched = { raw: unknown; item: unknown }[];

/** Primary provider from the main key, plus SearchApi.io as automatic backup when its key is set. */
function providers(): { provider: Provider; key: string }[] {
  const env = getEnv();
  const list: { provider: Provider; key: string }[] = [];
  if (env.SERPAPI_API_KEY) list.push({ provider: eventsProvider(), key: env.SERPAPI_API_KEY });
  if (env.SEARCHAPI_API_KEY && list[0]?.provider !== "searchapi") list.push({ provider: "searchapi", key: env.SEARCHAPI_API_KEY });
  return list;
}

const NO_RESULTS = /hasn't returned any results|didn't return any results|no results/i;

async function fetchFrom(provider: Provider, key: string, q: PlanRow): Promise<Fetched> {
  // SerpApi: the regular Google engine's events box (its google_events engine is not available
  // on this plan). SearchApi.io: the dedicated Google Events engine.
  const url =
    provider === "searchapi"
      ? `https://www.searchapi.io/api/v1/search?${new URLSearchParams({ engine: "google_events", q: q.q, gl: q.gl, hl: q.hl, api_key: key })}`
      : `https://serpapi.com/search.json?${new URLSearchParams({ engine: "google", q: q.q, gl: q.gl, hl: q.hl, location: "India", api_key: key })}`;
  const hint = cityFromQuery(q.q);
  // Retry network blips only: a timed-out search may still be billed, so it is not repeated.
  return withRetry(
    () =>
      withTimeout(`${provider} ${q.queryId}`, 55_000, async (signal) => {
        const res = await fetch(url, { signal, cache: "no-store" });
        const body: unknown = await res.json().catch(() => ({}));
        const parsed = SerpResponse.safeParse(body);
        if (!parsed.success) throw new Error(`Unexpected ${provider} payload (HTTP ${res.status})`);
        if (parsed.data.error && !NO_RESULTS.test(parsed.data.error)) throw new Error(`${provider}: ${parsed.data.error}`);
        if (!res.ok && !parsed.data.error) throw new Error(`${provider} HTTP ${res.status}`);
        if (provider === "searchapi") {
          const events = (body as { events?: SearchApiEvent[] }).events ?? [];
          return events.map((e) => ({ raw: e, item: toSerpShape(e) }));
        }
        return (parsed.data.events_results ?? []).map((e) => ({ raw: e, item: fromGoogleEventsBox(e as GoogleBoxEvent, hint) }));
      }),
    1,
    800,
    (e) => !(e instanceof TimeoutError) && !/results/i.test(errorText(e)),
  );
}

/**
 * One Google Events request: primary provider first, the backup provider if it fails.
 * Returns [stored raw item, SerpApi-shaped item] pairs.
 */
async function fetchSerp(q: PlanRow): Promise<{ items: Fetched; provider: Provider }> {
  let last: unknown;
  for (const p of providers()) {
    try {
      return { items: await fetchFrom(p.provider, p.key, q), provider: p.provider };
    } catch (e) {
      last = e;
      if (NO_RESULTS.test(errorText(e))) throw e;
    }
  }
  throw last ?? new Error("No events provider configured");
}

const MatchArray = z.array(z.object({ index: z.number().int(), artist_id: z.string().nullable(), confidence: z.number().min(0).max(1) }));

/** Stop starting new searches after this, so a run always finishes inside the function limit. */
const TIME_BUDGET_MS = 210_000;
const CONCURRENCY = 6;
const GEMINI_MATCH_CHUNK = 50;

type Pending = { rawId: number; ev: ParsedEvent; logId: number | null };
type Counts = Map<number, { results: number; matched: number; newShows: number }>;
type ArtistRow = { id: string; name: string; aliases: string[] };

/**
 * Match stored events to Karan's artists (alias first, batched Gemini for leftovers) and
 * merge every match into `shows`. Shared by the live sync and the credit-free re-match.
 */
async function matchAndMerge(pending: Pending[], artistRows: ArtistRow[], now: Date, perLog: Counts) {
  const db = getDb();
  const out = { matched: 0, newShows: 0, updatedShows: 0 };
  const matches: { p: Pending; artistId: string; confidence: number; method: "alias" | "gemini" }[] = [];
  const leftovers: Pending[] = [];
  for (const p of pending) {
    const found = aliasMatches(p.ev.title, artistRows);
    if (found.length === 0) leftovers.push(p);
    for (const f of found) matches.push({ p, artistId: f.artistId, confidence: 1, method: "alias" });
  }
  const ids = new Set(artistRows.map((a) => a.id));
  for (let i = 0; i < leftovers.length; i += GEMINI_MATCH_CHUNK) {
    const chunk = leftovers.slice(i, i + GEMINI_MATCH_CHUNK);
    const res = await geminiJson({
      label: `event→artist match ×${chunk.length}`,
      system: MATCH_SYSTEM,
      prompt: matchUserPrompt(
        artistRows.map((a) => ({ id: a.id, name: a.name })),
        chunk.map((p, index) => ({ index, title: p.ev.title, description: p.ev.description })),
      ),
      schema: MatchArray,
      timeoutMs: 45_000,
    });
    if (!res.ok) continue; // stays unchecked (match_confidence null) so the next run retries
    const seen = new Set<number>();
    for (const m of res.data) {
      const p = chunk[m.index];
      if (!p) continue;
      seen.add(m.index);
      if (m.artist_id && ids.has(m.artist_id) && m.confidence >= 0.8) matches.push({ p, artistId: m.artist_id, confidence: m.confidence, method: "gemini" });
      else
        await db
          .update(serpRawEvents)
          .set({ matchConfidence: m.confidence, matchedArtistId: m.artist_id && ids.has(m.artist_id) ? m.artist_id : null, matchMethod: "none" })
          .where(eq(serpRawEvents.id, p.rawId));
    }
    // Events Gemini skipped count as checked-and-unmatched.
    for (const [index, p] of chunk.entries()) if (!seen.has(index)) await db.update(serpRawEvents).set({ matchConfidence: 0 }).where(eq(serpRawEvents.id, p.rawId));
  }

  for (const m of matches) {
    const { showId, created } = await mergeFind({
      artistId: m.artistId,
      city: m.p.ev.city as string,
      date: m.p.ev.date as string,
      time: m.p.ev.time,
      eventName: m.p.ev.title,
      eventType: m.p.ev.isFestival ? "Festival" : "Concert",
      venue: m.p.ev.venue,
      sourceUrl: m.p.ev.link,
      source: "serpapi",
      serpTicketSource: m.p.ev.ticketSource,
      serpTicketUrl: m.p.ev.ticketLink,
      now,
    });
    await db.update(serpRawEvents).set({ matchedArtistId: m.artistId, matchConfidence: m.confidence, matchMethod: m.method, showId }).where(eq(serpRawEvents.id, m.p.rawId));
    out.matched++;
    if (created) out.newShows++;
    else out.updatedShows++;
    const c = m.p.logId !== null ? perLog.get(m.p.logId) : undefined;
    if (c) {
      c.matched++;
      if (created) c.newShows++;
    }
  }
  return out;
}

async function loadArtists(): Promise<ArtistRow[]> {
  return getDb().select({ id: artists.id, name: artists.name, aliases: artists.aliases }).from(artists);
}

/**
 * Run the Google Events plan rows that are due (or the given ids for "Sync now"), store every
 * raw result, match to Karan's artists and merge matches into `shows`. Never exceeds the quota.
 */
export async function runSerpSync(opts: { trigger: "cron" | "manual"; queryIds?: string[]; now?: Date }): Promise<SerpSyncSummary> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const db = getDb();
  const env = getEnv();
  const provider = eventsProvider();
  const quota = await quotaState(now);
  const base: SerpSyncSummary = { queriesRun: 0, results: 0, inScope: 0, matched: 0, newShows: 0, updatedShows: 0, searchesUsed: 0, quotaUsed: quota.used, quotaLimit: quota.limit };

  if (!env.SERPAPI_API_KEY) {
    const id = await startLog("serpapi", { trigger: opts.trigger, description: "Google Events sync skipped" });
    await finishLog(id, { error: "SERPAPI_API_KEY not configured" });
    return { ...base, skipped: "SERPAPI_API_KEY not configured" };
  }

  // The Google events box / SearchApi engine have no usable pagination, so page queries are skipped.
  const plan = (await db.select().from(serpQueryPlan).orderBy(asc(serpQueryPlan.queryId))).filter((p) => p.start === 0);
  const due = opts.queryIds ? plan.filter((p) => opts.queryIds?.includes(p.queryId)) : plan.filter((p) => isQueryDue(p.cadence, p.lastRunAt, now));
  if (due.length === 0) return { ...base, skipped: "no queries due" };
  const remaining = Math.max(0, quota.limit - quota.used);
  const runnable = due.slice(0, remaining);
  if (runnable.length < due.length) {
    const id = await startLog("serpapi", { trigger: opts.trigger, description: `Quota guard: skipped ${due.length - runnable.length} of ${due.length} due queries` });
    await finishLog(id, { error: `Quota ${quota.limit} reached (${quota.used} used)` });
    if (runnable.length === 0) return { ...base, skipped: "quota reached" };
  }

  const pending: Pending[] = [];
  const perLog: Counts = new Map();
  const summary = { ...base };
  let deferred = 0;

  for (let i = 0; i < runnable.length; i += CONCURRENCY) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      deferred = runnable.length - i; // still due; the next run picks them up
      break;
    }
    await Promise.all(
      runnable.slice(i, i + CONCURRENCY).map(async (q) => {
        const logId = await startLog("serpapi", {
          trigger: opts.trigger,
          description: `${q.q}${q.start ? ` (start=${q.start})` : ""} · ${provider === "searchapi" ? "SearchApi" : "SerpApi"} Google Events`,
          queryId: q.queryId,
          city: cityFromQuery(q.q),
          page: Math.floor(q.start / 10) + 1,
        });
        if (!(await takeSearch(quota.limit))) {
          await finishLog(logId, { error: "Quota reached" });
          return;
        }
        summary.searchesUsed++;
        try {
          const { items, provider: used } = await fetchSerp(q);
          if (used !== provider) await finishLog(logId, { description: `${q.q} · backup: SearchApi Google Events` });
          await db.update(serpQueryPlan).set({ lastRunAt: now }).where(eq(serpQueryPlan.queryId, q.queryId));
          summary.queriesRun++;
          summary.results += items.length;
          perLog.set(logId, { results: items.length, matched: 0, newShows: 0 });
          for (const { raw, item } of items) {
            const ev = parseEvent(item, now);
            if (!ev) continue;
            const [row] = await db
              .insert(serpRawEvents)
              .values({
                syncLogId: logId,
                queryId: q.queryId,
                query: q.q,
                city: cityFromQuery(q.q),
                page: Math.floor(q.start / 10) + 1,
                fetchedAt: now,
                title: ev.title,
                rawJson: raw as object,
                parsedCity: ev.city,
                parsedStartsAt: ev.date ? fromIst(ev.date, ev.time ?? "00:00") : null,
                skipReason: ev.skipReason,
              })
              .returning({ id: serpRawEvents.id });
            if (!ev.skipReason) {
              summary.inScope++;
              pending.push({ rawId: row.id, ev, logId });
            }
          }
          await finishLog(logId, { resultsCount: items.length, searchesUsed: 1 });
        } catch (e) {
          // A query that hit "no results" still counts as run today.
          if (/no results|didn't return any results|hasn't returned any results/i.test(errorText(e))) {
            await db.update(serpQueryPlan).set({ lastRunAt: now }).where(eq(serpQueryPlan.queryId, q.queryId));
            summary.queriesRun++;
            await finishLog(logId, { resultsCount: 0, searchesUsed: 1, description: `${q.q} · no events listed` });
          } else {
            await finishLog(logId, { error: errorText(e), searchesUsed: 1 });
          }
        }
      }),
    );
  }

  const res = await matchAndMerge(pending, await loadArtists(), now, perLog);
  summary.matched = res.matched;
  summary.newShows = res.newShows;
  summary.updatedShows = res.updatedShows;
  for (const [logId, c] of perLog) await finishLog(logId, { resultsCount: c.results, matchedCount: c.matched, newShowsCount: c.newShows, searchesUsed: 1 });
  if (deferred > 0) {
    const id = await startLog("serpapi", { trigger: opts.trigger, description: `Time budget: ${deferred} queries deferred to the next run` });
    await finishLog(id, {});
  }

  await setMeta("last_serp_sync_at", now.toISOString());
  const q = await quotaState(now);
  return { ...summary, quotaUsed: q.used, quotaLimit: q.limit };
}

/** Re-match stored events that were never checked (e.g. a run that stopped early). Costs no searches. */
export async function rematchStored(now = new Date()): Promise<{ checked: number; matched: number; newShows: number }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(serpRawEvents)
    .where(and(eq(serpRawEvents.matchMethod, "none"), isNull(serpRawEvents.skipReason), isNull(serpRawEvents.matchConfidence)))
    .limit(400);
  const pending: Pending[] = [];
  for (const r of rows) {
    const raw = r.rawJson as Record<string, unknown>;
    const shaped = "start_time" in raw ? toSerpShape(raw as SearchApiEvent) : typeof raw.date === "string" ? fromGoogleEventsBox(raw as GoogleBoxEvent, r.city) : raw;
    const ev = parseEvent(shaped, now);
    if (!ev || ev.skipReason) {
      await db.update(serpRawEvents).set({ skipReason: ev?.skipReason ?? "unparseable" }).where(eq(serpRawEvents.id, r.id));
      continue;
    }
    pending.push({ rawId: r.id, ev, logId: r.syncLogId });
  }
  const perLog: Counts = new Map();
  for (const p of pending) if (p.logId !== null && !perLog.has(p.logId)) perLog.set(p.logId, { results: 0, matched: 0, newShows: 0 });
  const res = await matchAndMerge(pending, await loadArtists(), now, perLog);
  for (const [logId, c] of perLog) if (c.matched > 0) await db.update(syncLog).set({ matchedCount: sql`${syncLog.matchedCount} + ${c.matched}`, newShowsCount: sql`${syncLog.newShowsCount} + ${c.newShows}` }).where(eq(syncLog.id, logId));
  return { checked: pending.length, matched: res.matched, newShows: res.newShows };
}

/** "Sync now": the least-recently-run daily city query (one search). */
export async function pickManualQuery(): Promise<string | null> {
  const rows = await getDb()
    .select({ id: serpQueryPlan.queryId, last: serpQueryPlan.lastRunAt })
    .from(serpQueryPlan)
    .where(inArray(serpQueryPlan.cadence, ["daily"]));
  rows.sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));
  return rows[0]?.id ?? null;
}
