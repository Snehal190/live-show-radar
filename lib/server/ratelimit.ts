import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Fixed-window counter in Postgres (works across serverless instances). */
export async function rateLimit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const key = `${bucket}:${await clientIp()}`;
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then ${now.toISOString()}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= limit;
}
