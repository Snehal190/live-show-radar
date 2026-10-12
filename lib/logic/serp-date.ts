import { addIstDays, istDate } from "@/lib/time";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export interface ParsedSerpDate {
  date: string; // yyyy-MM-dd (IST calendar date)
  time: string | null; // HH:mm IST, null when SerpApi gives no usable time
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "Dec 13" / "13 Dec" → [month, day] */
function monthDay(text: string): [number, number] | null {
  const a = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/);
  if (a) {
    const mon = MONTHS[a[1].toLowerCase().slice(0, 3)];
    if (mon) return [mon, Number(a[2])];
  }
  const b = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\b/);
  if (b) {
    const mon = MONTHS[b[2].toLowerCase().slice(0, 3)];
    if (mon) return [mon, Number(b[1])];
  }
  return null;
}

/**
 * Year inference: SerpApi's start_date has no year ("Dec 13"). If that month/day in the
 * current IST year is more than ~30 days before today, the event must be next year.
 */
export function inferYear(month: number, day: number, today: Date, graceDays = 30): number {
  const todayStr = istDate(today);
  const floor = addIstDays(todayStr, -graceDays);
  const year = Number(todayStr.slice(0, 4));
  // Earliest of last/this/next year that is not more than `graceDays` in the past
  // (so "Dec 20" seen on 1 Jan is last December, not next).
  for (const y of [year - 1, year, year + 1]) {
    if (`${y}-${pad(month)}-${pad(day)}` >= floor) return y;
  }
  return year + 1;
}

/**
 * First clock time in a `when` string ("Sat, Dec 13, 7 – 10 PM" → 19:00).
 * A bare hour without AM/PM borrows the meridiem of the next time in the range;
 * with no meridiem anywhere, only 24h "HH:mm" is trusted.
 */
export function parseWhenTime(when: string): string | null {
  // Drop weekday + month/day so day numbers are not mistaken for hours.
  const cleaned = when
    .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b,?/gi, " ")
    .replace(/\b([A-Za-z]{3,9})\.?\s+\d{1,2}(?:\s*[–-]\s*\d{1,2})?(?:,\s*\d{4})?\b/g, (m, mon: string) =>
      MONTHS[mon.toLowerCase().slice(0, 3)] ? " " : m,
    )
    .replace(/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, " ");
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d:])/gi;
  const tokens: { h: number; m: number; mer: string | null; colon: boolean }[] = [];
  for (const t of cleaned.matchAll(re)) {
    const h = Number(t[1]);
    if (h > 23) continue;
    tokens.push({ h, m: t[2] ? Number(t[2]) : 0, mer: t[3] ? t[3].replace(/\./g, "").toLowerCase() : null, colon: Boolean(t[2]) });
  }
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const mer = first.mer ?? tokens.slice(1).find((t) => t.mer)?.mer ?? null;
  if (mer) {
    if (first.h < 1 || first.h > 12) return null;
    const h24 = (first.h % 12) + (mer === "pm" ? 12 : 0);
    return `${pad(h24)}:${pad(first.m)}`;
  }
  return first.colon ? `${pad(first.h)}:${pad(first.m)}` : null;
}

export function parseSerpDate(startDate: string | undefined, when: string | undefined, today: Date): ParsedSerpDate | null {
  const source = startDate && monthDay(startDate) ? startDate : when;
  if (!source) return null;
  const md = monthDay(source);
  if (!md) return null;
  const [month, day] = md;
  if (day < 1 || day > 31) return null;
  const explicitYear = (when ?? "").match(/\b(20\d{2})\b/);
  const year = explicitYear ? Number(explicitYear[1]) : inferYear(month, day, today);
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: when ? parseWhenTime(when) : null };
}
