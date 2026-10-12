import { getDb } from "@/lib/db";
import { isAuthorizedCron, unauthorized } from "@/lib/server/cron-auth";
import { setMeta } from "@/lib/server/meta";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { applyShowTemplates } from "@/lib/seed/apply";

export const maxDuration = 60;

/** 00:05 IST: re-anchor demo shows + simulated early-birds to today. Never touches real data. */
async function handle(req: Request) {
  if (!isAuthorizedCron(req)) return unauthorized();
  const now = new Date();
  const logId = await startLog("reset", { trigger: "cron", description: "Daily reset: re-anchor demo shows and simulated early-birds" });
  try {
    const res = await applyShowTemplates(getDb(), now);
    await setMeta("last_reset_at", now.toISOString());
    await finishLog(logId, { resultsCount: res.known + res.demo, alertsCreated: res.historicalAlerts });
    return Response.json(res);
  } catch (e) {
    await finishLog(logId, { error: errorText(e) });
    return Response.json({ error: errorText(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
