import type { AlertKind, Priority, Urgency } from "@/lib/logic/rules";

export interface CopyInput {
  type: AlertKind;
  urgency: Urgency;
  artist: string; // for festivals: "Kayan, Yashraj +3"
  priority: Priority;
  city: string;
  festivalName?: string;
  artistCount?: number;
}

export interface Copy {
  headline: string;
  line: string;
}

/**
 * Deterministic copy used when Gemini is unavailable (and for seeded history). Like the AI
 * copy, it never mentions a date, price, venue or deadline: those live in the fact block.
 */
export function templateCopy(i: CopyInput): Copy {
  const away = i.city !== "Bengaluru";
  switch (i.type) {
    case "new_show":
      if (i.urgency === "critical") return { headline: `🚨 Bhai, phone utha. ${i.artist} is playing ${i.city}.`, line: "Itna stream kiya hai, ab seat bhi le le." };
      if (away) return { headline: `✈️ ${i.artist} in ${i.city}. Trip, sponsored by FOMO?`, line: "Out of town, but worth a proper think. Facts below." };
      return { headline: `🎶 ${i.artist} just announced a ${i.city} show`, line: "Naya show, fresh off the press. Decide before the internet does." };
    case "festival":
      return {
        headline: `🎪 ${i.festivalName ?? "A festival"}: ${i.artistCount ?? 2} of your artists, one ground`,
        line: `${i.artist}. Ek ticket, kai sets. Lineup goals.`,
      };
    case "eb_live":
      return { headline: `⏰ ${i.artist} early-bird is live`, line: "Sasta wala ticket abhi khula hai. Ye wahi moment hai." };
    case "eb_closing":
      return { headline: `⏰ Last call, Karan saab: ${i.artist} early-bird`, line: "Deadline is close. Kal ka kaam aaj, aaj ka abhi." };
    case "decide_soon":
      return { headline: `🤔 ${i.artist} is round the corner. Going?`, line: "Going, Interested ya Skip — bas ek tap. Maybe wala mode band karo." };
    case "show_week":
      return { headline: `📅 One week to ${i.artist}`, line: "Outfit, ride, squad — sab sort kar le." };
    case "tonight":
      return { headline: `🎤 Tonight: ${i.artist}`, line: "Phone charged, ticket ready, voice warmed up. Enjoy!" };
    case "missed":
      return { headline: `😔 ${i.artist} slipped away`, line: "Ye wala gaya. Agli baar radar pe pehle se hain." };
    case "nudge":
      return { headline: `👀 Bhai, seen-zone kar diya? ${i.artist}`, line: "Early-bird abhi bhi khula hai. Going ya Skip, kuch toh bol." };
    case "eb_sold_out":
      return { headline: `🔥 ${i.artist} early-bird sold out`, line: "Sasta wala gaya. General abhi bhi option hai — dekh le." };
    case "general_sold_out":
      return { headline: `🔥 ${i.artist}: tickets sold out`, line: "Housefull. Resale pe nazar rakhna, aur agli baar pehle." };
  }
}
