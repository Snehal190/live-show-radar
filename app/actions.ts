"use server";

import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { alerts, artists, shows } from "@/lib/db/schema";
import { rateLimit } from "@/lib/server/ratelimit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const StatusInput = z.object({
  showId: z.number().int().positive(),
  action: z.enum(["going_early_bird", "going_general", "interested", "skipped", "clear"]),
});

/** Going (early-bird) / Going (general) / Remind me (status "interested") / Skip. Public write: validated + rate-limited. */
export async function setShowStatus(input: z.input<typeof StatusInput>): Promise<ActionResult> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (!(await rateLimit("status", 30, 60_000))) return { ok: false, error: "Easy, tiger — too many taps. Try again in a minute." };
  const { showId, action } = parsed.data;
  const patch =
    action === "going_early_bird"
      ? { karanStatus: "going" as const, bookedTier: "early_bird" as const }
      : action === "going_general"
        ? { karanStatus: "going" as const, bookedTier: "general" as const }
        : action === "clear"
          ? { karanStatus: null, bookedTier: null }
          : { karanStatus: action, bookedTier: null };
  const updated = await getDb()
    .update(shows)
    .set({ ...patch, statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(shows.id, showId))
    .returning({ id: shows.id });
  if (updated.length === 0) return { ok: false, error: "Show not found" };
  revalidatePath("/", "layout");
  return { ok: true };
}

const PriorityInput = z.object({ artistId: z.string().regex(/^A\d{3}$/), priority: z.enum(["Must-see", "Like"]) });

export async function setArtistPriority(input: z.input<typeof PriorityInput>): Promise<ActionResult> {
  const parsed = PriorityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (!(await rateLimit("priority", 30, 60_000))) return { ok: false, error: "Too many changes. Try again in a minute." };
  await getDb().update(artists).set({ priority: parsed.data.priority, updatedAt: new Date() }).where(eq(artists.id, parsed.data.artistId));
  revalidatePath("/", "layout");
  return { ok: true };
}

const ReadInput = z.object({ alertId: z.number().int().positive().optional() });

export async function markAlertsRead(input: z.input<typeof ReadInput>): Promise<ActionResult> {
  const parsed = ReadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  if (!(await rateLimit("read", 60, 60_000))) return { ok: false, error: "Too many requests" };
  const db = getDb();
  if (parsed.data.alertId) await db.update(alerts).set({ readAt: new Date() }).where(eq(alerts.id, parsed.data.alertId));
  else await db.update(alerts).set({ readAt: new Date() }).where(isNull(alerts.readAt));
  revalidatePath("/", "layout");
  return { ok: true };
}
