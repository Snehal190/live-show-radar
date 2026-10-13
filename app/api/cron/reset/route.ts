import { runDailyReset } from "@/lib/engine/reset";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";
import { errorText } from "@/lib/server/synclog";

export const maxDuration = 60;

/** Nightly (after 00:00 IST): re-anchor sample shows + simulated early-birds to today. */
async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  try {
    return Response.json(await runDailyReset("cron"));
  } catch (e) {
    return Response.json({ error: errorText(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
