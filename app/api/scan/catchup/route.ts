import { runScan } from "@/lib/engine/scan";
import { getMeta, metaDate } from "@/lib/server/meta";

export const maxDuration = 60;

/**
 * Catch-up scan when the Radar opens. Public but debounced: skipped if the last scan was
 * under 2 minutes ago (the scan itself is idempotent and lock-protected).
 */
export async function POST() {
  const meta = await getMeta(["last_scan_at"]);
  const last = metaDate(meta.last_scan_at);
  if (last && Date.now() - last.getTime() < 2 * 60_000) {
    return Response.json({ skipped: "debounced", lastScanAt: last.toISOString() });
  }
  try {
    const summary = await runScan("catchup");
    return Response.json({ ...summary, lastScanAt: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
