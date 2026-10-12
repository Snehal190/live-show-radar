import { chooseTicketSource, ebState, type TicketChoice } from "@/lib/logic/rules";
import type { Artist, Show } from "@/lib/db/schema";
import { formatDeadline, formatShowDate, humanDuration } from "@/lib/time";

export interface FactBlock {
  artist: string;
  event: string;
  venue: string;
  city: string;
  date: string;
  earlyBird: string;
  earlyBirdUrgent: boolean;
  prices: string | null;
  tags: string[];
  ticket: TicketChoice;
  sourceUrl: string | null;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Human early-bird line, purely from stored facts. Never guesses. */
export function earlyBirdLine(show: Show, now: Date): { text: string; urgent: boolean } {
  const st = ebState(show, now);
  const simulated = show.ebSource === "simulated" ? " (simulated)" : "";
  switch (st) {
    case "none":
      return { text: "Early-bird: not announced yet", urgent: false };
    case "sold_out":
      return { text: `Early-bird: sold out${simulated}`, urgent: false };
    case "closed":
      return { text: `Early-bird: closed${simulated}`, urgent: false };
    case "upcoming":
      return {
        text: `Early-bird opens ${formatDeadline(show.ebOpensAt as Date)}${show.ebClosesAt ? `, closes ${formatDeadline(show.ebClosesAt)}` : ""}${simulated}`,
        urgent: (show.ebOpensAt as Date).getTime() - now.getTime() < 24 * 3600_000,
      };
    case "open": {
      if (!show.ebClosesAt) return { text: `Early-bird: open now${simulated}`, urgent: false };
      const left = show.ebClosesAt.getTime() - now.getTime();
      return {
        text: `Early-bird OPEN · closes ${formatDeadline(show.ebClosesAt)} (${humanDuration(left)} left)${simulated}`,
        urgent: left <= 48 * 3600_000,
      };
    }
  }
}

export function showDateText(show: Show): string {
  const base = formatShowDate(show.startsAt, show.timeKnown);
  if (show.dateLabel) return `${show.dateLabel} (${base.split(" · ")[0]})`;
  return show.timeKnown ? base : `${base}, time TBA`;
}

export function buildFacts(show: Show, artist: Pick<Artist, "name">, now: Date): FactBlock {
  const eb = earlyBirdLine(show, now);
  const prices: string[] = [];
  if (show.ebPriceInr !== null) prices.push(`Early-bird ${inr(show.ebPriceInr)}${show.ebSource === "simulated" ? " (simulated)" : ""}`);
  if (show.generalPriceInr !== null) prices.push(`General ${inr(show.generalPriceInr)}`);
  const tags: string[] = [];
  if (show.ebSource === "simulated") tags.push("Simulated early-bird");
  return {
    artist: artist.name,
    event: show.eventName,
    venue: show.venue && show.venue !== "TBA" ? show.venue : "Venue TBA",
    city: show.city,
    date: showDateText(show),
    earlyBird: eb.text,
    earlyBirdUrgent: eb.urgent,
    prices: prices.length ? prices.join(" · ") : null,
    tags,
    ticket: chooseTicketSource(show),
    sourceUrl: show.sourceUrl,
  };
}
