import { runScan } from "@/lib/engine/scan";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";
import { rematchStored, runSerpSync } from "@/lib/serp/sync";

export const maxDuration = 300;

/** Daily Google Events sync. `?rematch=1` re-matches stored events only (no searches spent). */
async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  try {
    if (new URL(req.url).searchParams.get("rematch") === "1") {
      const rematch = await rematchStored();
      const scan = rematch.newShows > 0 ? await runScan("cron") : null;
      return Response.json({ rematch, scan });
    }
    const sync = await runSerpSync({ trigger: "cron" });
    // New shows become alerts right away instead of waiting for the next 5-minute scan.
    const scan = sync.newShows > 0 ? await runScan("cron") : null;
    return Response.json({ sync, scan });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
