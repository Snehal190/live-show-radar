import { DAY_MS, HOUR_MS, istDate, istDaysBetween } from "@/lib/time";
import { festivalBaseName } from "./text";

export type Priority = "Must-see" | "Like";
export type Urgency = "critical" | "high" | "medium" | "low" | "info";
export type KaranStatus = "going" | "interested" | "skipped" | null;
export type ReminderType = "eb_live" | "eb_closing" | "decide_soon" | "show_week" | "tonight" | "missed";
export type AlertKind =
  | "new_show"
  | "festival"
  | "eb_sold_out"
  | "general_sold_out"
  | ReminderType
  | "nudge";

/** The slice of a show the rules need. Kept structural so tests can build plain objects. */
export interface ShowFacts {
  id: number;
  city: string;
  eventName: string;
  eventType: "Concert" | "Festival";
  startsAt: Date;
  announcedAt: Date;
  ebOpensAt: Date | null;
  ebClosesAt: Date | null;
  ebStatusOverride: string | null;
  generalStatus: string | null;
  karanStatus: KaranStatus;
}

export interface PastAlert {
  type: AlertKind;
  urgency: Urgency;
  createdAt: Date;
  isHistorical: boolean;
}

// ───────────────────────── City rule ─────────────────────────

export interface AlertRule {
  city: string;
  priority: string;
  sendsAlert: boolean;
}

/** Most specific rule wins: city+priority → city+'*' → '*'+priority → '*'+'*'. Default: no alert. */
export function cityRuleSendsAlert(city: string, priority: Priority, rules: readonly AlertRule[]): boolean {
  const order: [string, string][] = [
    [city, priority],
    [city, "*"],
    ["*", priority],
    ["*", "*"],
  ];
  for (const [c, p] of order) {
    const r = rules.find((x) => x.city.toLowerCase() === c.toLowerCase() && x.priority === p);
    if (r) return r.sendsAlert;
  }
  return false;
}

/** Shows Karan already committed to keep their reminders even in a visible-only city. */
export function isAlertable(show: Pick<ShowFacts, "city" | "karanStatus">, priority: Priority, rules: readonly AlertRule[]): boolean {
  return cityRuleSendsAlert(show.city, priority, rules) || show.karanStatus === "going" || show.karanStatus === "interested";
}

export function needsVerdict(city: string, priority: Priority): boolean {
  return priority === "Must-see" && (city === "Mumbai" || city === "Chennai");
}

// ───────────────────────── Early-bird state ─────────────────────────

export type EbState = "none" | "upcoming" | "open" | "closed" | "sold_out";

export function ebState(show: Pick<ShowFacts, "ebOpensAt" | "ebClosesAt" | "ebStatusOverride">, now: Date): EbState {
  if (!show.ebOpensAt && !show.ebClosesAt) return show.ebStatusOverride === "Sold out" ? "sold_out" : "none";
  if (show.ebStatusOverride === "Sold out") return "sold_out";
  if (show.ebOpensAt && now < show.ebOpensAt) return "upcoming";
  if (show.ebClosesAt && now >= show.ebClosesAt) return "closed";
  return "open";
}

export function isGeneralSoldOut(show: Pick<ShowFacts, "generalStatus">): boolean {
  return show.generalStatus === "Sold out";
}

// ───────────────────────── Urgency ─────────────────────────

/** Spec: Bengaluru + Must-see new show = critical, otherwise high. An early-bird that closes within 48h is also critical. */
export function newShowUrgency(show: Pick<ShowFacts, "city" | "ebOpensAt" | "ebClosesAt" | "ebStatusOverride">, priority: Priority, now: Date): Urgency {
  if (show.city === "Bengaluru" && priority === "Must-see") return "critical";
  const st = ebState(show, now);
  if (st === "open" && show.ebClosesAt && show.ebClosesAt.getTime() - now.getTime() <= 48 * HOUR_MS) return "critical";
  return "high";
}

export const REMINDER_URGENCY: Record<ReminderType | "nudge" | "eb_sold_out" | "general_sold_out", Urgency> = {
  eb_live: "critical",
  eb_closing: "critical",
  decide_soon: "medium",
  show_week: "low",
  tonight: "low",
  missed: "info",
  nudge: "critical",
  eb_sold_out: "high",
  general_sold_out: "high",
};

export const URGENCY_RANK: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// ───────────────────────── Idempotency ─────────────────────────

/** show_id + ':' + type + ':' + IST date. Festival alerts use "fest-<key>" in place of the show id. */
export function idempotencyKey(subject: number | string, type: AlertKind, now: Date): string {
  return `${subject}:${type}:${istDate(now)}`;
}

// ───────────────────────── Detector ─────────────────────────

const ANNOUNCE_TYPES: readonly AlertKind[] = ["new_show", "festival"];

export function hasBeenAnnounced(past: readonly PastAlert[]): boolean {
  return past.some((a) => ANNOUNCE_TYPES.includes(a.type));
}

export function isNewlyAnnounced(show: Pick<ShowFacts, "announcedAt">, past: readonly PastAlert[], now: Date): boolean {
  return show.announcedAt <= now && !hasBeenAnnounced(past);
}

export function festivalGroupKey(show: Pick<ShowFacts, "eventName" | "city" | "startsAt">): string {
  return `${festivalBaseName(show.eventName)}|${show.city.toLowerCase()}|${istDate(show.startsAt)}`;
}

/**
 * Festival rule: newly announced shows that share festival + city + date with at least one
 * other of Karan's shows become one combined alert. Returns groups (size ≥ 2 counting
 * already-alerted siblings) and the remaining single shows.
 */
export function groupFestivalAnnouncements<T extends ShowFacts>(
  fresh: readonly T[],
  allFestivalShows: readonly ShowFacts[],
): { festivals: { key: string; shows: T[]; siblingCount: number }[]; singles: T[] } {
  const groups = new Map<string, T[]>();
  const singles: T[] = [];
  for (const s of fresh) {
    if (s.eventType !== "Festival") {
      singles.push(s);
      continue;
    }
    const key = festivalGroupKey(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const festivals: { key: string; shows: T[]; siblingCount: number }[] = [];
  for (const [key, members] of groups) {
    const siblingCount = allFestivalShows.filter((s) => s.eventType === "Festival" && festivalGroupKey(s) === key).length;
    if (siblingCount >= 2) festivals.push({ key, shows: members, siblingCount });
    else singles.push(...members);
  }
  return { festivals, singles };
}

// ───────────────────────── Reminder ─────────────────────────

function toldDuring(past: readonly PastAlert[], types: readonly AlertKind[], from: Date): boolean {
  return past.some((a) => types.includes(a.type) && a.createdAt >= from);
}

/** Missed: passed or fully sold out, and Karan never acted (status empty or only "interested"). */
export function isMissed(show: Pick<ShowFacts, "startsAt" | "generalStatus" | "karanStatus">, now: Date): boolean {
  if (show.karanStatus === "going" || show.karanStatus === "skipped") return false;
  return show.startsAt < now || isGeneralSoldOut(show);
}

/**
 * Which reminders are due for one show right now. Every reminder fires at most once per
 * show; early-bird reminders are also skipped when Karan was already told inside the same
 * window (e.g. the 13:00 Kayan drop's "new show" alert already carries the 7 PM deadline,
 * so no separate "early-bird live"/"closing" email follows it).
 */
export function selectReminders(show: ShowFacts, past: readonly PastAlert[], now: Date): ReminderType[] {
  if (show.karanStatus === "skipped") return [];
  const had = (t: AlertKind) => past.some((a) => a.type === t);
  const out: ReminderType[] = [];

  if (isMissed(show, now)) {
    if (!had("missed")) out.push("missed");
    return out;
  }
  if (show.startsAt < now) return out;

  const eb = ebState(show, now);
  const informTypes: AlertKind[] = ["new_show", "festival", "eb_live", "eb_closing", "nudge"];

  if (eb === "open" && show.ebOpensAt && istDate(show.ebOpensAt) === istDate(now) && !had("eb_live")) {
    if (!toldDuring(past, informTypes, show.ebOpensAt)) out.push("eb_live");
  }
  if (eb === "open" && show.ebClosesAt && show.ebClosesAt.getTime() - now.getTime() <= 48 * HOUR_MS && !had("eb_closing")) {
    const windowStart = new Date(Math.max(show.ebClosesAt.getTime() - 48 * HOUR_MS, show.ebOpensAt?.getTime() ?? 0));
    const coveredByThisRun = out.includes("eb_live");
    if (!coveredByThisRun && !toldDuring(past, informTypes, windowStart)) out.push("eb_closing");
  }

  const msToShow = show.startsAt.getTime() - now.getTime();
  if (show.karanStatus === null && msToShow <= 14 * DAY_MS && !had("decide_soon")) {
    // A fresh announcement in the last 24h already asks Karan to decide.
    if (!toldDuring(past, ["new_show", "festival"], new Date(now.getTime() - DAY_MS))) out.push("decide_soon");
  }

  const days = istDaysBetween(now, show.startsAt);
  if (show.karanStatus === "going" && days === 7 && !had("show_week")) out.push("show_week");
  if (show.karanStatus === "going" && days === 0 && !had("tonight")) out.push("tonight");
  return out;
}

// ───────────────────────── Smart nudge ─────────────────────────

/** One follow-up when a critical alert got no action for 6h and the early-bird is still open. */
export function shouldNudge(show: ShowFacts, past: readonly PastAlert[], now: Date): boolean {
  if (show.karanStatus !== null) return false;
  if (past.some((a) => a.type === "nudge")) return false;
  if (ebState(show, now) !== "open") return false;
  return past.some((a) => !a.isHistorical && a.urgency === "critical" && now.getTime() - a.createdAt.getTime() >= 6 * HOUR_MS);
}

// ───────────────────────── Where to buy ─────────────────────────

const KNOWN_HOSTS: [RegExp, string][] = [
  [/bookmyshow\./i, "BookMyShow"],
  [/district\.in|zomato\.com/i, "District"],
  [/skillboxes\.com|skillbox/i, "Skillbox"],
  [/insider\.in/i, "Insider"],
  [/ticketmaster\./i, "Ticketmaster"],
  [/eventbrite\./i, "Eventbrite"],
  [/highape\.com/i, "HighApe"],
  [/allevents\.in/i, "Allevents"],
  [/sortmyscene\.com/i, "SortMyScene"],
  [/ticketfairy\.com/i, "The Ticket Fairy"],
];

export function siteNameFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [re, name] of KNOWN_HOSTS) if (re.test(host)) return name;
  const core = host.replace(/^www\./, "").split(".")[0];
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : null;
}

export interface TicketChoice {
  platform: string;
  url: string | null;
  label: string;
  via: "serpapi" | "serpapi_link" | "known" | "fallback";
}

/** ticket_source_rules, in order: SerpApi source name → SerpApi link's site → known platform → BookMyShow. */
export function chooseTicketSource(s: {
  serpTicketSource: string | null;
  serpTicketUrl: string | null;
  ticketPlatform: string | null;
}): TicketChoice {
  if (s.serpTicketSource && s.serpTicketSource.trim()) {
    const p = s.serpTicketSource.trim();
    return { platform: p, url: s.serpTicketUrl, label: `Tickets via ${p} · found by SerpApi Google Events`, via: "serpapi" };
  }
  if (s.serpTicketUrl) {
    const p = siteNameFromUrl(s.serpTicketUrl);
    if (p) return { platform: p, url: s.serpTicketUrl, label: `Tickets via ${p} · found by SerpApi Google Events`, via: "serpapi_link" };
  }
  if (s.ticketPlatform && s.ticketPlatform.trim()) {
    const p = s.ticketPlatform.trim();
    return { platform: p, url: null, label: `Tickets via ${p}`, via: "known" };
  }
  return { platform: "BookMyShow", url: "https://in.bookmyshow.com/explore/music-shows", label: "Check BookMyShow", via: "fallback" };
}

/** Pick the ticket link from SerpApi ticket_info: prefer link_type "tickets". */
export function pickSerpTicket(info: readonly { source?: string; link?: string; link_type?: string }[] | undefined): { source: string | null; link: string | null } {
  if (!info || info.length === 0) return { source: null, link: null };
  const t = info.find((i) => i.link_type === "tickets" && i.link) ?? info.find((i) => i.link);
  return { source: t?.source?.trim() || null, link: t?.link ?? null };
}

// ───────────────────────── FOMO Meter ─────────────────────────

export interface FomoInput {
  karanStatus: KaranStatus;
  bookedTier: "early_bird" | "general" | null;
  ebPriceInr: number | null;
  generalPriceInr: number | null;
  announcedAt: Date;
  statusChangedAt: Date | null;
  missed: boolean;
}

export interface FomoStats {
  caught: number;
  missed: number;
  earlyBirds: number;
  moneySavedInr: number;
  avgHoursToAction: number | null;
  score: number; // 0–100, share of decided shows Karan caught
}

export function fomoStats(items: readonly FomoInput[]): FomoStats {
  const going = items.filter((i) => i.karanStatus === "going");
  const missed = items.filter((i) => i.missed).length;
  const eb = going.filter((i) => i.bookedTier === "early_bird");
  const moneySavedInr = eb.reduce(
    (sum, i) => sum + (i.generalPriceInr !== null && i.ebPriceInr !== null ? Math.max(0, i.generalPriceInr - i.ebPriceInr) : 0),
    0,
  );
  const acted = items.filter((i) => i.karanStatus !== null && i.statusChangedAt !== null);
  const avgHoursToAction =
    acted.length === 0
      ? null
      : Math.round(
          (acted.reduce((s, i) => s + Math.max(0, (i.statusChangedAt as Date).getTime() - i.announcedAt.getTime()), 0) / acted.length / HOUR_MS) * 10,
        ) / 10;
  const decided = going.length + missed;
  return {
    caught: going.length,
    missed,
    earlyBirds: eb.length,
    moneySavedInr,
    avgHoursToAction,
    score: decided === 0 ? 100 : Math.round((going.length / decided) * 100),
  };
}
