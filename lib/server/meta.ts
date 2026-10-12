import "server-only";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appMeta } from "@/lib/db/schema";

export type MetaKey =
  | "last_scan_at"
  | "last_serp_sync_at"
  | "last_web_scan_at"
  | "last_reset_at"
  | "last_manual_sync_at"
  | "serp_searches_this_month"
  | "serp_quota_month"
  | "web_scan_cursor"
  | "owl_last_message"
  | "scan_lock";

export async function getMeta<K extends MetaKey>(keys: readonly K[]): Promise<Partial<Record<K, string>>> {
  const rows = await getDb().select().from(appMeta).where(inArray(appMeta.key, [...keys]));
  const out: Partial<Record<K, string>> = {};
  for (const r of rows) out[r.key as K] = r.value;
  return out;
}

export async function setMeta(key: MetaKey, value: string): Promise<void> {
  const now = new Date();
  await getDb()
    .insert(appMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value, updatedAt: now } });
}

/**
 * Atomically claim a time-based slot: sets `key` to now only if it is older than `minGapMs`.
 * Returns true when this caller won the slot. Used for the scan debounce and Sync-now limiter.
 */
export async function claimSlot(key: MetaKey, minGapMs: number, now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - minGapMs).toISOString();
  const rows = await getDb()
    .insert(appMeta)
    .values({ key, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: now.toISOString(), updatedAt: now },
      setWhere: sql`${appMeta.value} = '' or ${appMeta.value} < ${cutoff}`,
    })
    .returning({ key: appMeta.key });
  return rows.length > 0;
}

export function metaDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
