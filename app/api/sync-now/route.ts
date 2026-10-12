import { runScan } from "@/lib/engine/scan";
import { claimSlot, getMeta, metaDate } from "@/lib/server/meta";
import { pickManualQuery, runSerpSync } from "@/lib/serp/sync";

export const maxDuration = 60;
const WINDOW_MS = 60 * 60_000;

/** Public "Sync now" on the Live Feed: one SerpApi search, globally limited to once per hour. */
export async function POST() {
  if (!(await claimSlot("last_manual_sync_at", WINDOW_MS))) {
    const last = metaDate((await getMeta(["last_manual_sync_at"])).last_manual_sync_at);
    const nextAt = last ? new Date(last.getTime() + WINDOW_MS).toISOString() : null;
    return Response.json({ error: "rate_limited", nextAt }, { status: 429 });
  }
  const queryId = await pickManualQuery();
  if (!queryId) return Response.json({ error: "no query plan" }, { status: 500 });
  try {
    const sync = await runSerpSync({ trigger: "manual", queryIds: [queryId] });
    const scan = sync.newShows > 0 ? await runScan("manual") : null;
    return Response.json({ queryId, sync, scan, nextAt: new Date(Date.now() + WINDOW_MS).toISOString() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
