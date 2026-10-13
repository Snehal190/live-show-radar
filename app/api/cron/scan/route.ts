import { ensureDailyReset } from "@/lib/engine/reset";
import { runScan } from "@/lib/engine/scan";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";

export const maxDuration = 60;

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  try {
    // Local-only time travel for verifying the demo timeline; ignored in production.
    const override = process.env.NODE_ENV !== "production" ? req.headers.get("x-radar-now") : null;
    const now = override ? new Date(override) : new Date();
    // If the nightly reset hasn't run yet today (IST), do it first so today's sample drops exist.
    const resetRan = override ? false : await ensureDailyReset(now);
    return Response.json({ ...(await runScan("cron", now)), resetRan });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
