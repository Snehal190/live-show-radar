import { runScan } from "@/lib/engine/scan";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";
import { runWebScan } from "@/lib/web/scan";

export const maxDuration = 120;

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  try {
    const web = await runWebScan();
    const scan = web.newShows > 0 ? await runScan("cron") : null;
    return Response.json({ web, scan });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
