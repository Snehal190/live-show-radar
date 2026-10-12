import { z } from "zod";
import { detectCity } from "@/lib/logic/city";
import { pickSerpTicket } from "@/lib/logic/rules";
import { parseSerpDate } from "@/lib/logic/serp-date";
import { addIstDays, istDate } from "@/lib/time";

/** Loose on purpose: SerpApi fields are optional and evolve; we validate what we read. */
export const SerpEvent = z
  .object({
    title: z.string(),
    date: z.object({ start_date: z.string().optional(), when: z.string().optional() }).partial().optional(),
    address: z.array(z.string()).optional(),
    link: z.string().optional(),
    description: z.string().optional(),
    venue: z.object({ name: z.string().optional() }).partial().optional(),
    ticket_info: z.array(z.object({ source: z.string().optional(), link: z.string().optional(), link_type: z.string().optional() })).optional(),
  })
  .passthrough();
export type SerpEvent = z.infer<typeof SerpEvent>;

export const SerpResponse = z
  .object({
    error: z.string().optional(),
    events_results: z.array(z.unknown()).optional(),
    search_metadata: z.object({ id: z.string().optional(), status: z.string().optional() }).partial().optional(),
  })
  .passthrough();

export interface ParsedEvent {
  raw: unknown;
  title: string;
  description: string;
  date: string | null;
  time: string | null;
  city: string | null;
  venue: string | null;
  link: string | null;
  ticketSource: string | null;
  ticketLink: string | null;
  isFestival: boolean;
  skipReason: string | null;
}

const FESTIVAL_RE = /\b(fest|festival|lollapalooza|sunburn|weekender|nh7|dgtl|zomaland|vh1 supersonic|magnetic fields)\b/i;

/** Normalise one events_results item and decide whether it is in scope (India, next 6 months). */
export function parseEvent(raw: unknown, now: Date, horizonMonths = 6): ParsedEvent | null {
  const p = SerpEvent.safeParse(raw);
  if (!p.success) return null;
  const e = p.data;
  const d = parseSerpDate(e.date?.start_date, e.date?.when, now);
  const loc = detectCity(e.address, e.venue?.name);
  const ticket = pickSerpTicket(e.ticket_info);
  const today = istDate(now);
  const horizon = addIstDays(today, Math.round(horizonMonths * 30.5));
  let skipReason: string | null = null;
  if (!d) skipReason = "no parseable date";
  else if (d.date < today) skipReason = "in the past";
  else if (d.date > horizon) skipReason = "beyond 6-month horizon";
  else if (!loc.inIndia) skipReason = "outside India";
  return {
    raw,
    title: e.title,
    description: (e.description ?? "").slice(0, 400),
    date: d?.date ?? null,
    time: d?.time ?? null,
    city: loc.city,
    venue: e.venue?.name ?? e.address?.[0]?.split(",")[0] ?? null,
    link: e.link ?? null,
    ticketSource: ticket.source,
    ticketLink: ticket.link,
    isFestival: FESTIVAL_RE.test(e.title),
    skipReason,
  };
}

/** "concerts in Bengaluru" → "Bengaluru"; artist sweeps have no city. */
export function cityFromQuery(q: string): string | null {
  const m = q.match(/\bin\s+([A-Za-z ]+)$/);
  return m && !/india/i.test(m[1]) ? m[1].trim() : null;
}

/** Is a plan row due? daily: not yet today (IST); weekly: ≥ 7 days; monthly: ≥ 30 days. */
export function isQueryDue(cadence: "daily" | "weekly" | "monthly", lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  if (cadence === "daily") return istDate(lastRunAt) < istDate(now);
  const days = (now.getTime() - lastRunAt.getTime()) / 86_400_000;
  // Small slack so a job that ran at 09:00:05 last week is due at 09:00:00 this week.
  return cadence === "weekly" ? days >= 6.9 : days >= 29.9;
}
