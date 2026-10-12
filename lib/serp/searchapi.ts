import { detectCity } from "@/lib/logic/city";
import { siteNameFromUrl } from "@/lib/logic/rules";

/** SearchApi.io google_events item (same Google Events data as SerpApi, different field names). */
export interface SearchApiEvent {
  title?: string;
  date?: string; // "Sat, Oct 17" | "Today"
  start_time?: string; // "Oct 17, 8:30 PM"
  venue?: string;
  address?: string; // "Bengaluru, India"
  link?: string;
  seller?: string; // "district.in", "bookmy.show"
  category?: string;
  price?: string;
}

const SELLERS: [RegExp, string][] = [
  [/bookmy\.?show/i, "BookMyShow"],
  [/district\.in/i, "District"],
  [/skillbox/i, "Skillbox"],
  [/insider\.in/i, "Insider"],
  [/bandsintown/i, "Bandsintown"],
  [/liveyourcity/i, "Live Your City"],
  [/instagram/i, "Instagram"],
];

/** Listing/social sites that link to an event but don't sell tickets. */
const INFO_ONLY = /bandsintown|instagram|facebook|allevents|songkick|wikipedia/i;

export function sellerName(seller: string | undefined, link: string | undefined): string | null {
  const s = seller ?? "";
  for (const [re, name] of SELLERS) if (re.test(s)) return name;
  if (s) return siteNameFromUrl(`https://${s}`);
  return link ? siteNameFromUrl(link) : null;
}

/**
 * Map a SearchApi.io event onto the SerpApi google_events shape our parser reads.
 * `start_time` always carries month + day (even when `date` says "Today"), so it is used for both.
 */
export function toSerpShape(e: SearchApiEvent): Record<string, unknown> {
  const when = e.start_time ?? e.date ?? "";
  const seller = sellerName(e.seller, e.link);
  return {
    title: e.title ?? "",
    date: { start_date: when, when },
    address: [e.venue, e.address].filter(Boolean),
    venue: e.venue ? { name: e.venue } : undefined,
    link: e.link,
    description: [e.category, e.price].filter(Boolean).join(" · "),
    ticket_info: e.link && !INFO_ONLY.test(`${e.seller ?? ""} ${e.link}`) ? [{ source: seller ?? undefined, link: e.link, link_type: "tickets" }] : [],
  };
}

/** SerpApi `engine=google` events box item: { title, type, date: "17 Oct", time: "8:30", address[] }. */
export interface GoogleBoxEvent {
  title?: string;
  type?: string;
  date?: string;
  time?: string;
  address?: string[];
  link?: string;
  ticket_info?: { source?: string; link?: string; link_type?: string }[];
}

/**
 * The events box omits AM/PM ("8:30"); concert times between 1 and 11 are evening, so PM is
 * assumed. When the address names only a locality, the city from the query is appended.
 */
export function fromGoogleEventsBox(e: GoogleBoxEvent, cityHint: string | null): Record<string, unknown> {
  const t = (e.time ?? "").trim();
  const h = Number(t.split(":")[0]);
  const time = t && !/am|pm/i.test(t) && h >= 1 && h <= 11 ? `${t} PM` : t;
  const when = [e.date, time].filter(Boolean).join(", ");
  const address = [...(e.address ?? [])];
  const det = detectCity(address);
  if (cityHint && !(det.inIndia && det.city)) address.push(`${cityHint}, India`);
  return {
    title: e.title ?? "",
    date: { start_date: e.date ?? "", when },
    address,
    venue: address[0] ? { name: address[0] } : undefined,
    link: e.link,
    description: e.type ?? "",
    ticket_info: e.ticket_info ?? [],
  };
}
