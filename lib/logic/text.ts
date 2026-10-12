/** Case/punctuation/diacritic-insensitive form used for alias matching and dedupe keys. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

/**
 * "DGTL India 2026 (Nov 13–14, day TBA)" → { name: "DGTL India 2026", dateLabel: "Nov 13–14, day TBA" }.
 * Parentheticals that are not dates ("(Day 1)", "(demo)") stay in the name.
 */
export function splitDateLabel(eventName: string): { name: string; dateLabel: string | null } {
  const m = eventName.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m && MONTH_RE.test(m[2])) return { name: m[1].trim(), dateLabel: m[2].trim() };
  return { name: eventName.trim(), dateLabel: null };
}

/** Festival identity: base name without any parenthetical, normalised. */
export function festivalBaseName(eventName: string): string {
  return normalize(eventName.replace(/\([^()]*\)/g, " "));
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(the|and)$/i.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue 0–359 from a string (for gradient artist tiles). */
export function hueFor(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
