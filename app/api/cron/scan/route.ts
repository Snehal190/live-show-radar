import { runScan } from "@/lib/engine/scan";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";

export const maxDuration = 60;

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  try {
    // Local-only time travel for verifying the demo timeline; ignored in production.
    const override = process.env.NODE_ENV !== "production" ? req.headers.get("x-radar-now") : null;
    return Response.json(await runScan("cron", override ? new Date(override) : new Date()));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
