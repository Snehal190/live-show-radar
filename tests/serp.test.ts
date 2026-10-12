import { describe, expect, it } from "vitest";
import { copyViolations } from "@/lib/logic/copy-guard";
import { templateCopy } from "@/lib/alerts/templates";
import { ruleVerdict } from "@/lib/logic/verdict";
import { cityFromQuery, isQueryDue, parseEvent } from "@/lib/serp/parse";
import { fromIst } from "@/lib/time";

const now = fromIst("2026-10-12", "09:00");

// Shape of a real SerpApi google_events item.
const ITEM = {
  title: "Fred again.. - India Tour 2026",
  date: { start_date: "Dec 12", when: "Sat, Dec 12, 6 – 11 PM" },
  address: ["NICE Grounds, Bengaluru International Exhibition Centre", "Bengaluru, Karnataka"],
  link: "https://in.bookmyshow.com/events/fred-again-india-tour/ET0001",
  description: "Fred again.. brings his live show to India.",
  ticket_info: [
    { source: "Allevents.in", link: "https://allevents.in/x", link_type: "more info" },
    { source: "BookMyShow", link: "https://in.bookmyshow.com/x", link_type: "tickets" },
  ],
  venue: { name: "NICE Grounds", rating: 4.2, reviews: 120 },
};

describe("SerpApi event parsing", () => {
  it("extracts date, time, city, venue and ticket source", () => {
    const e = parseEvent(ITEM, now);
    expect(e).toMatchObject({ date: "2026-12-12", time: "18:00", city: "Bengaluru", venue: "NICE Grounds", ticketSource: "BookMyShow", isFestival: false, skipReason: null });
  });
  it("marks out-of-scope events but keeps them for the raw feed", () => {
    expect(parseEvent({ ...ITEM, address: ["O2 Arena", "London, UK"] }, now)?.skipReason).toBe("outside India");
    expect(parseEvent({ ...ITEM, date: { start_date: "Oct 5", when: "Mon, Oct 5, 8 PM" } }, now)?.skipReason).toBe("in the past");
    expect(parseEvent({ ...ITEM, date: { start_date: "Aug 20" } }, now)?.skipReason).toBe("beyond 6-month horizon");
    expect(parseEvent({ ...ITEM, title: "Sunburn Festival 2026" }, now)?.isFestival).toBe(true);
    expect(parseEvent({ nope: 1 }, now)).toBeNull();
  });
  it("reads the city from the query", () => {
    expect(cityFromQuery("concerts in Bengaluru")).toBe("Bengaluru");
    expect(cityFromQuery("Fred again.. concert India")).toBeNull();
  });
});

describe("query cadence", () => {
  it("daily = once per IST day, weekly = 7 days, monthly = 30 days", () => {
    expect(isQueryDue("daily", null, now)).toBe(true);
    expect(isQueryDue("daily", fromIst("2026-10-12", "00:30"), now)).toBe(false);
    expect(isQueryDue("daily", fromIst("2026-10-11", "23:50"), now)).toBe(true);
    expect(isQueryDue("weekly", fromIst("2026-10-06", "09:00"), now)).toBe(false);
    expect(isQueryDue("weekly", fromIst("2026-10-05", "09:00"), now)).toBe(true);
    expect(isQueryDue("monthly", fromIst("2026-09-20", "09:00"), now)).toBe(false);
    expect(isQueryDue("monthly", fromIst("2026-09-12", "09:00"), now)).toBe(true);
  });
});

describe("AI copy guard", () => {
  it("rejects dates, times, prices, deadlines and venues", () => {
    expect(copyViolations("Kayan early-bird closes at 7 PM", "Go!", null)).not.toEqual([]);
    expect(copyViolations("Kayan on Nov 14", "Go!", null)).not.toEqual([]);
    expect(copyViolations("Kayan tickets ₹1499", "Go!", null)).not.toEqual([]);
    expect(copyViolations("Kayan", "Only 6 hours left bhai", null)).not.toEqual([]);
    expect(copyViolations("Kayan at Phoenix Marketcity", "Go!", "Phoenix Marketcity, Whitefield")).not.toEqual([]);
    expect(copyViolations("🚨 Kayan 🔥", "Go!", null)).toContain("more than one emoji");
  });
  it("accepts on-voice copy", () => {
    expect(copyViolations("🚨 Bhai, phone utha. Kayan is playing Bengaluru.", "Itna stream kiya hai, ab seat bhi le le.", "Phoenix Marketcity")).toEqual([]);
  });
  it("every template passes its own guard", () => {
    const types = ["new_show", "festival", "eb_live", "eb_closing", "decide_soon", "show_week", "tonight", "missed", "nudge", "eb_sold_out", "general_sold_out"] as const;
    for (const type of types)
      for (const urgency of ["critical", "high"] as const) {
        const c = templateCopy({ type, urgency, artist: "Shanka Tribe", priority: "Like", city: "Mumbai", festivalName: "Indie Fest", artistCount: 3 });
        expect(copyViolations(c.headline, c.line, "KTPO, Whitefield"), `${type}/${urgency}`).toEqual([]);
      }
  });
});

describe("Worth-the-trip rule fallback", () => {
  const base = { priority: "Must-see" as const, weekend: true, clashesWithGoing: false, alsoPlaysBengaluru: false, daysOfNotice: 30, genre: "Indie" };
  it("go / think / skip", () => {
    expect(ruleVerdict(base).verdict).toBe("go");
    expect(ruleVerdict({ ...base, alsoPlaysBengaluru: true }).verdict).toBe("skip");
    expect(ruleVerdict({ ...base, clashesWithGoing: true }).verdict).toBe("think");
    expect(ruleVerdict({ ...base, weekend: false }).verdict).toBe("think");
  });
});

describe("SerpApi Google events box adapter", () => {
  it("assumes PM for bare concert times and fills a locality-only address from the query city", async () => {
    const { fromGoogleEventsBox } = await import("@/lib/serp/searchapi");
    const shaped = fromGoogleEventsBox({ title: "Khalid", type: "Concert", date: "15 Dec", time: "6:00", address: ["Bhartiya Mall", "Thanisandra"] }, "Bengaluru");
    expect(parseEvent(shaped, now)).toMatchObject({ date: "2026-12-15", time: "18:00", city: "Bengaluru", skipReason: null });
    const blr = fromGoogleEventsBox({ title: "X", date: "17 Oct", time: "8:30", address: ["Alliance Française de Bangalore", "Vasanth Nagar"] }, "Mumbai");
    expect(parseEvent(blr, now)).toMatchObject({ city: "Bengaluru", time: "20:30" });
  });
});
