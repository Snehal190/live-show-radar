import { z } from "zod";
import { splitDateLabel } from "@/lib/logic/text";
import { addIstDays, DAY_MS, fromIst, HOUR_MS, istDate } from "@/lib/time";

const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()));
const nullableInt = z
  .number()
  .int()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const KnownShowRow = z.object({
  show_id: z.string(),
  artist_id: z.string(),
  artist_name: z.string(),
  event_type: z.enum(["Concert", "Festival"]),
  event_name: z.string(),
  city: z.string(),
  venue: nullableStr,
  show_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  show_time_ist: nullableStr,
  ticket_platform: nullableStr,
  source_url: nullableStr,
  early_bird_source: z.enum(["Unknown", "Simulated"]),
  eb_opens_day_offset: nullableInt,
  eb_opens_time: nullableStr,
  eb_closes_day_offset: nullableInt,
  eb_closes_time: nullableStr,
  eb_price_inr: nullableInt,
  general_price_inr: nullableInt,
  eb_status_override: nullableStr,
  karan_status: nullableStr,
  booked_tier: nullableStr,
  sends_alert: nullableInt,
  note: nullableStr,
});
export type KnownShowRow = z.infer<typeof KnownShowRow>;

export const DemoShowRow = z.object({
  show_id: z.string(),
  artist_id: z.string(),
  artist_name: z.string(),
  event_type: z.enum(["Concert", "Festival"]),
  event_name: z.string(),
  city: z.string(),
  venue: nullableStr,
  announce_day_offset: z.number().int(),
  announce_time_ist: z.string(),
  show_day_offset: z.number().int(),
  show_time_ist: nullableStr,
  eb_opens_day_offset: nullableInt,
  eb_opens_time: nullableStr,
  eb_closes_day_offset: nullableInt,
  eb_closes_time: nullableStr,
  eb_price_inr: nullableInt,
  general_price_inr: nullableInt,
  eb_status_override: nullableStr,
  general_status: nullableStr,
  karan_status: nullableStr,
  booked_tier: nullableStr,
  is_daily_drop: z.number().int(),
  seed_as_already_alerted: z.number().int(),
  sends_alert: nullableInt,
  scenario: nullableStr,
});
export type DemoShowRow = z.infer<typeof DemoShowRow>;

export function mapStatus(s: string | null): "going" | "interested" | "skipped" | null {
  const v = (s ?? "").toLowerCase();
  if (v === "going") return "going";
  if (v === "interested") return "interested";
  if (v === "skipped" || v === "skip") return "skipped";
  return null;
}

export function mapTier(s: string | null): "early_bird" | "general" | null {
  const v = (s ?? "").toLowerCase();
  if (v.startsWith("early")) return "early_bird";
  if (v === "general") return "general";
  return null;
}

function at(today: string, offset: number | null, time: string | null): Date | null {
  if (offset === null) return null;
  return fromIst(addIstDays(today, offset), time ?? "00:00");
}

/** Fields that the seed and the daily reset both write. */
export interface AnchoredShow {
  seedId: string;
  artistId: string;
  eventName: string;
  eventType: "Concert" | "Festival";
  city: string;
  venue: string | null;
  startsAt: Date;
  timeKnown: boolean;
  dateLabel: string | null;
  source: "known" | "demo";
  sourceUrl: string | null;
  ticketPlatform: string | null;
  announcedAt: Date;
  ebSource: "simulated" | "unknown" | "demo";
  ebOpensAt: Date | null;
  ebClosesAt: Date | null;
  ebPriceInr: number | null;
  generalPriceInr: number | null;
  ebStatusOverride: string | null;
  generalStatus: string | null;
  karanStatus: "going" | "interested" | "skipped" | null;
  bookedTier: "early_bird" | "general" | null;
  statusChangedAt: Date | null;
  isDailyDrop: boolean;
  scenario: string | null;
  dedupeKey: string;
  seedAsAlreadyAlerted: boolean;
}

/** A simulated early-bird that would close after the show is dropped entirely. */
function guardEarlyBird(opens: Date | null, closes: Date | null, startsAt: Date): [Date | null, Date | null] {
  if (closes && closes > startsAt) return [null, null];
  if (opens && opens > startsAt) return [null, null];
  return [opens, closes];
}

/** Seeded statuses get a plausible "acted at" so the FOMO Meter has history to show. */
function seededActionAt(status: AnchoredShow["karanStatus"], tier: AnchoredShow["bookedTier"], announcedAt: Date, now: Date): Date | null {
  if (!status) return null;
  const hours = tier === "early_bird" ? 2 : status === "going" ? 30 : 8;
  const t = new Date(announcedAt.getTime() + hours * HOUR_MS);
  return t > now ? now : t;
}

/** Real show: date fixed; a simulated early-bird window is anchored to "today". */
export function anchorKnown(row: KnownShowRow, now: Date): AnchoredShow {
  const today = istDate(now);
  const startsAt = fromIst(row.show_date, row.show_time_ist ?? "00:00");
  const simulated = row.early_bird_source === "Simulated";
  const [ebOpensAt, ebClosesAt] = simulated
    ? guardEarlyBird(at(today, row.eb_opens_day_offset, row.eb_opens_time), at(today, row.eb_closes_day_offset, row.eb_closes_time), startsAt)
    : [null, null];
  const keepEb = simulated && (ebOpensAt !== null || ebClosesAt !== null);
  // Real listings were announced before we started watching: a week ago, or when the early-bird opened if earlier.
  const weekAgo = new Date(fromIst(today, "12:00").getTime() - 7 * DAY_MS);
  const announcedAt = ebOpensAt && ebOpensAt < weekAgo ? ebOpensAt : weekAgo;
  const { name, dateLabel } = splitDateLabel(row.event_name);
  const karanStatus = mapStatus(row.karan_status);
  const bookedTier = mapTier(row.booked_tier);
  return {
    seedId: row.show_id,
    artistId: row.artist_id,
    eventName: name,
    eventType: row.event_type,
    city: row.city,
    venue: row.venue,
    startsAt,
    timeKnown: row.show_time_ist !== null,
    dateLabel,
    source: "known",
    sourceUrl: row.source_url,
    ticketPlatform: row.ticket_platform,
    announcedAt,
    ebSource: keepEb ? "simulated" : "unknown",
    ebOpensAt: keepEb ? ebOpensAt : null,
    ebClosesAt: keepEb ? ebClosesAt : null,
    ebPriceInr: keepEb ? row.eb_price_inr : null,
    generalPriceInr: row.general_price_inr,
    ebStatusOverride: keepEb ? row.eb_status_override : null,
    generalStatus: null,
    karanStatus,
    bookedTier,
    statusChangedAt: seededActionAt(karanStatus, bookedTier, announcedAt, now),
    isDailyDrop: false,
    scenario: row.note,
    dedupeKey: `seed:${row.show_id}`,
    seedAsAlreadyAlerted: true,
  };
}

/** Invented show: every date is an offset from today. */
export function anchorDemo(row: DemoShowRow, now: Date): AnchoredShow {
  const today = istDate(now);
  const startsAt = fromIst(addIstDays(today, row.show_day_offset), row.show_time_ist ?? "00:00");
  const announcedAt = fromIst(addIstDays(today, row.announce_day_offset), row.announce_time_ist);
  const [ebOpensAt, ebClosesAt] = guardEarlyBird(
    at(today, row.eb_opens_day_offset, row.eb_opens_time),
    at(today, row.eb_closes_day_offset, row.eb_closes_time),
    startsAt,
  );
  const hasEb = ebOpensAt !== null || ebClosesAt !== null;
  const karanStatus = mapStatus(row.karan_status);
  const bookedTier = mapTier(row.booked_tier);
  return {
    seedId: row.show_id,
    artistId: row.artist_id,
    eventName: row.event_name.replace(/\s*\((?:demo|demo festival)\)\s*$/i, "").trim(),
    eventType: row.event_type,
    city: row.city,
    venue: row.venue,
    startsAt,
    timeKnown: row.show_time_ist !== null,
    dateLabel: null,
    source: "demo",
    sourceUrl: null,
    ticketPlatform: null,
    announcedAt,
    ebSource: "demo",
    ebOpensAt,
    ebClosesAt,
    ebPriceInr: hasEb ? row.eb_price_inr : null,
    generalPriceInr: row.general_price_inr,
    ebStatusOverride: hasEb ? row.eb_status_override : null,
    generalStatus: row.general_status,
    karanStatus,
    bookedTier,
    statusChangedAt: seededActionAt(karanStatus, bookedTier, announcedAt, now),
    isDailyDrop: row.is_daily_drop === 1,
    scenario: row.scenario,
    dedupeKey: `seed:${row.show_id}`,
    seedAsAlreadyAlerted: row.seed_as_already_alerted === 1,
  };
}
