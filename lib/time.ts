import { addDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** All business logic runs in IST. Timestamps are stored as UTC timestamptz. */
export const IST = "Asia/Kolkata";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** "2026-10-12" — the IST calendar date of an instant. */
export function istDate(d: Date): string {
  return formatInTimeZone(d, IST, "yyyy-MM-dd");
}

/** Instant for an IST wall-clock date + time ("2026-10-12", "13:00"). */
export function fromIst(date: string, time = "00:00"): Date {
  const t = /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  return fromZonedTime(`${date}T${t}:00`, IST);
}

/** Add whole days to an IST calendar date string. */
export function addIstDays(date: string, days: number): string {
  // Noon avoids any DST-style edge (IST has none, but the host TZ might).
  const base = new Date(`${date}T12:00:00Z`);
  return addDays(base, days).toISOString().slice(0, 10);
}

/** Calendar-day distance in IST between two instants (to − from). */
export function istDaysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(new Date(`${istDate(to)}T12:00:00Z`), new Date(`${istDate(from)}T12:00:00Z`));
}

export function formatIst(d: Date, pattern: string): string {
  return formatInTimeZone(d, IST, pattern);
}

/** "Sat, 14 Nov 2026" or with time "Sat, 14 Nov 2026 · 5:00 PM IST" */
export function formatShowDate(d: Date, timeKnown: boolean): string {
  return timeKnown ? formatIst(d, "EEE, d MMM yyyy · h:mm a 'IST'") : formatIst(d, "EEE, d MMM yyyy");
}

export function formatDeadline(d: Date): string {
  return formatIst(d, "EEE d MMM, h:mm a 'IST'");
}

/** Monday..Sunday in IST; true for Fri evening / Sat / Sun shows. */
export function isWeekendIst(d: Date): boolean {
  const dow = Number(formatIst(d, "i")); // 1 = Mon … 7 = Sun
  return dow === 6 || dow === 7 || (dow === 5 && Number(formatIst(d, "H")) >= 18);
}

/** "2h 14m", "3d 4h", "12m" */
export function humanDuration(ms: number): string {
  const abs = Math.max(0, ms);
  const m = Math.floor(abs / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function timeAgo(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "never";
  const ms = now.getTime() - d.getTime();
  if (ms < 60000) return "just now";
  return `${humanDuration(ms)} ago`;
}
