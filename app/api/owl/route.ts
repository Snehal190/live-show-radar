import { and, count, desc, gt, inArray, lte } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { shows, syncLog } from "@/lib/db/schema";
import { getMeta } from "@/lib/server/meta";

/**
 * The Owl's only data source: reads app_meta + sync_log + a count of shows that appeared
 * since the viewer's previous visit. It never triggers a scan or any external call.
 * `?visit=1` (sent once when the app loads) rotates the visit cookies.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const now = new Date();
  const url = new URL(req.url);
  const lastSeen = jar.get("lsr_last_seen")?.value;
  let prev = jar.get("lsr_prev_visit")?.value ?? null;
  if (url.searchParams.get("visit") === "1") {
    // A new visit = more than 30 minutes since the last time we saw this browser.
    if (lastSeen && now.getTime() - new Date(lastSeen).getTime() > 30 * 60_000) prev = lastSeen;
    if (!prev) prev = lastSeen ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
    const opts = { httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 90, path: "/" };
    jar.set("lsr_prev_visit", prev, opts);
    jar.set("lsr_last_seen", now.toISOString(), opts);
  }
  const since = prev ? new Date(prev) : new Date(now.getTime() - 24 * 3600_000);
  const db = getDb();
  const [meta, [{ n }], [lastLog]] = await Promise.all([
    getMeta(["last_scan_at", "last_serp_sync_at"]),
    // New = announced since the previous visit (SerpApi/Gemini finds are announced when found; demo drops at their drop time).
    db.select({ n: count() }).from(shows).where(and(gt(shows.announcedAt, since), lte(shows.announcedAt, now))),
    db.select().from(syncLog).where(inArray(syncLog.kind, ["scan", "serpapi"])).orderBy(desc(syncLog.startedAt)).limit(1),
  ]);
  const newShows = Number(n);
  return Response.json(
    {
      lastScanAt: meta.last_scan_at || null,
      lastSerpSyncAt: meta.last_serp_sync_at || null,
      lastLog: lastLog ? { kind: lastLog.kind, at: lastLog.startedAt.toISOString(), description: lastLog.description } : null,
      newShowsSinceVisit: newShows,
      since: since.toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
