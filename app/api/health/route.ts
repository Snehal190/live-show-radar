import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getEnv, hasGemini } from "@/lib/env";
import { getMeta } from "@/lib/server/meta";

export async function GET() {
  const env = getEnv();
  let db: "ok" | string = "ok";
  let meta: Awaited<ReturnType<typeof getMeta>> = {};
  try {
    await getDb().execute(sql`select 1`);
    meta = await getMeta(["last_scan_at", "last_serp_sync_at", "last_web_scan_at", "last_reset_at", "serp_searches_this_month", "serp_quota_month"]);
  } catch (e) {
    db = `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  return Response.json(
    {
      ok: db === "ok",
      db,
      lastScanAt: meta.last_scan_at ?? null,
      lastSerpSyncAt: meta.last_serp_sync_at ?? null,
      lastWebScanAt: meta.last_web_scan_at ?? null,
      lastResetAt: meta.last_reset_at ?? null,
      quota: { used: Number(meta.serp_searches_this_month ?? 0), limit: env.SERPAPI_MONTHLY_QUOTA, month: meta.serp_quota_month || null },
      services: { gemini: hasGemini(), serpapi: Boolean(env.SERPAPI_API_KEY), resend: Boolean(env.RESEND_API_KEY), emailDryRun: env.EMAIL_DRY_RUN },
    },
    { status: db === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
