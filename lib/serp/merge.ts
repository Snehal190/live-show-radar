import "server-only";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shows } from "@/lib/db/schema";
import { DAY_MS, fromIst } from "@/lib/time";

export interface Find {
  artistId: string;
  city: string;
  date: string; // IST yyyy-MM-dd
  time: string | null;
  eventName: string;
  eventType: "Concert" | "Festival";
  venue: string | null;
  sourceUrl: string | null;
  source: "serpapi" | "gemini_web";
  serpTicketSource?: string | null;
  serpTicketUrl?: string | null;
  ticketPlatform?: string | null;
  ebClosesAt?: Date | null;
  ebPriceInr?: number | null;
  generalPriceInr?: number | null;
  now: Date;
}

/**
 * Dedupe/merge: same artist + same city + date within ±1 day updates the existing show
 * (never a demo show); otherwise a new show is created with announced_at = now, which the
 * Detector turns into an alert on the next scan.
 */
export async function mergeFind(f: Find): Promise<{ showId: number; created: boolean }> {
  const db = getDb();
  const day = fromIst(f.date, "12:00");
  const [existing] = await db
    .select()
    .from(shows)
    .where(
      and(
        eq(shows.artistId, f.artistId),
        eq(shows.city, f.city),
        ne(shows.source, "demo"),
        gte(shows.startsAt, new Date(day.getTime() - 1.5 * DAY_MS)),
        lte(shows.startsAt, new Date(day.getTime() + 1.5 * DAY_MS)),
      ),
    )
    .limit(1);

  if (existing) {
    const patch: Partial<typeof shows.$inferInsert> = { updatedAt: f.now };
    if (f.source === "serpapi") {
      patch.source = "serpapi";
      patch.serpFetchedAt = f.now;
      if (f.serpTicketSource || f.serpTicketUrl) {
        patch.serpTicketSource = f.serpTicketSource ?? null;
        patch.serpTicketUrl = f.serpTicketUrl ?? null;
      }
      if (f.sourceUrl) patch.sourceUrl = f.sourceUrl;
    } else if (!existing.sourceUrl && f.sourceUrl) {
      patch.sourceUrl = f.sourceUrl;
    }
    if (!existing.ticketPlatform && f.ticketPlatform) patch.ticketPlatform = f.ticketPlatform;
    if ((!existing.venue || existing.venue === "TBA") && f.venue) patch.venue = f.venue;
    if (!existing.timeKnown && f.time && !existing.dateLabel) {
      patch.startsAt = fromIst(f.date, f.time);
      patch.timeKnown = true;
    }
    await db.update(shows).set(patch).where(eq(shows.id, existing.id));
    return { showId: existing.id, created: false };
  }

  const hasEb = Boolean(f.ebClosesAt);
  const [row] = await db
    .insert(shows)
    .values({
      artistId: f.artistId,
      eventName: f.eventName.slice(0, 200),
      eventType: f.eventType,
      city: f.city,
      venue: f.venue,
      startsAt: fromIst(f.date, f.time ?? "00:00"),
      timeKnown: Boolean(f.time),
      source: f.source,
      sourceUrl: f.sourceUrl,
      ticketPlatform: f.ticketPlatform ?? null,
      serpTicketSource: f.serpTicketSource ?? null,
      serpTicketUrl: f.serpTicketUrl ?? null,
      serpFetchedAt: f.source === "serpapi" ? f.now : null,
      announcedAt: f.now,
      ebSource: hasEb ? "real" : "unknown",
      ebClosesAt: f.ebClosesAt ?? null,
      ebPriceInr: hasEb ? (f.ebPriceInr ?? null) : null,
      generalPriceInr: f.generalPriceInr ?? null,
      dedupeKey: `${f.source}:${f.artistId}:${f.city.toLowerCase()}:${f.date}`,
    })
    .onConflictDoNothing({ target: shows.dedupeKey })
    .returning({ id: shows.id });
  if (row) return { showId: row.id, created: true };
  const [dupe] = await db.select({ id: shows.id }).from(shows).where(eq(shows.dedupeKey, `${f.source}:${f.artistId}:${f.city.toLowerCase()}:${f.date}`));
  return { showId: dupe.id, created: false };
}
