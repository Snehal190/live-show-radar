import { normalize } from "./text";

const BANNED: RegExp[] = [
  /₹|\brs\.?\s*\d|\binr\b|\$\s*\d|\brupees?\b/i, // prices
  /\b\d{1,2}(:\d{2})?\s*(am|pm|baje)\b/i, // clock times
  /\b\d{1,2}:\d{2}\b/, // 19:00
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, // Nov 14
  /\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, // 14 Nov
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b20\d{2}\b/, // years
  /\b\d+\s*(hours?|hrs?|days?|mins?|minutes?|ghante|din)\b/i, // "6 hours left"
  /\b\d{3,}\b/, // any other big number (prices, counts)
];

function countEmoji(s: string): number {
  return [...s.matchAll(/\p{Extended_Pictographic}/gu)].length;
}

/**
 * Deterministic safety net for AI copy: rejects text that states a date, time, price or
 * deadline, names the venue, or uses more than one emoji. Rejected copy is replaced by the
 * template, so facts in alerts always come from the database.
 */
export function copyViolations(headline: string, line: string, venue: string | null): string[] {
  const text = `${headline} ${line}`;
  const v: string[] = [];
  for (const re of BANNED) if (re.test(text)) v.push(`matches ${re.source}`);
  if (venue && venue !== "TBA") {
    const nv = normalize(venue.split(",")[0]);
    if (nv.length >= 4 && normalize(text).includes(nv)) v.push("names the venue");
  }
  if (countEmoji(text) > 1) v.push("more than one emoji");
  if (headline.length > 90 || line.length > 140) v.push("too long");
  if (headline.trim().length < 4 || line.trim().length < 4) v.push("empty");
  return v;
}
