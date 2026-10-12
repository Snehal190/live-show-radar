import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { syncLog } from "@/lib/db/schema";

type Kind = (typeof syncLog.$inferInsert)["kind"];
type Fields = Partial<Omit<typeof syncLog.$inferInsert, "id" | "kind">>;

export async function startLog(kind: Kind, fields: Fields = {}): Promise<number> {
  const [row] = await getDb()
    .insert(syncLog)
    .values({ kind, startedAt: new Date(), ...fields })
    .returning({ id: syncLog.id });
  return row.id;
}

export async function finishLog(id: number, fields: Fields = {}): Promise<void> {
  await getDb()
    .update(syncLog)
    .set({ finishedAt: new Date(), ...fields })
    .where(eq(syncLog.id, id));
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 500);
}
