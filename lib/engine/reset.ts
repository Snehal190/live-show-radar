import "server-only";
import { getDb } from "@/lib/db";
import { resetDue } from "@/lib/logic/reset";
import { getMeta, metaDate, setMeta } from "@/lib/server/meta";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { applyShowTemplates, type ApplyResult } from "@/lib/seed/apply";

/** Re-anchor sample shows + simulated early-birds to today (IST). Never touches real data. */
export async function runDailyReset(trigger: "cron" | "self-heal", now = new Date()): Promise<ApplyResult> {
  const logId = await startLog("reset", {
    trigger,
    description: trigger === "cron" ? "Daily reset: re-anchor demo shows and simulated early-birds" : "Daily reset (self-heal from the 5-minute scan)",
  });
  try {
    const res = await applyShowTemplates(getDb(), now);
    await setMeta("last_reset_at", now.toISOString());
    await finishLog(logId, { resultsCount: res.known + res.demo, alertsCreated: res.historicalAlerts });
    return res;
  } catch (e) {
    await finishLog(logId, { error: errorText(e) });
    throw e;
  }
}

/**
 * Safety net for the nightly cron: Vercel Hobby crons fire anywhere within their hour, so the
 * 5-minute scan runs the reset itself if it hasn't happened yet on today's IST date.
 */
export async function ensureDailyReset(now = new Date()): Promise<boolean> {
  const last = metaDate((await getMeta(["last_reset_at"])).last_reset_at);
  if (!resetDue(last, now)) return false;
  await runDailyReset("self-heal", now);
  return true;
}
