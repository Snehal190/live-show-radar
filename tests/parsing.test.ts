import { describe, expect, it } from "vitest";
import { aliasMatches } from "@/lib/logic/alias";
import { cityBucket, detectCity } from "@/lib/logic/city";
import { inferYear, parseSerpDate, parseWhenTime } from "@/lib/logic/serp-date";
import { festivalBaseName, initials, normalize, splitDateLabel } from "@/lib/logic/text";
import { fromIst, istDate, istDaysBetween } from "@/lib/time";

const today = fromIst("2026-10-12", "10:00");

describe("IST helpers", () => {
  it("uses the IST calendar date, not UTC, around midnight", () => {
    // 2026-10-12 00:10 IST is still 2026-10-11 in UTC.
    const justAfterMidnight = fromIst("2026-10-12", "00:10");
    expect(justAfterMidnight.toISOString()).toBe("2026-10-11T18:40:00.000Z");
    expect(istDate(justAfterMidnight)).toBe("2026-10-12");
    // 23:59 IST on the 11th is 18:29 UTC on the 11th.
    expect(istDate(fromIst("2026-10-11", "23:59"))).toBe("2026-10-11");
  });

  it("counts calendar days in IST", () => {
    expect(istDaysBetween(fromIst("2026-10-12", "23:50"), fromIst("2026-10-13", "00:05"))).toBe(1);
    expect(istDaysBetween(fromIst("2026-10-12", "00:05"), fromIst("2026-10-12", "23:55"))).toBe(0);
    expect(istDaysBetween(fromIst("2026-10-12", "09:00"), fromIst("2026-10-19", "19:00"))).toBe(7);
  });
});

describe("SerpApi year inference", () => {
  it("keeps the current year for upcoming dates", () => {
    expect(inferYear(12, 13, today)).toBe(2026);
    expect(inferYear(10, 12, today)).toBe(2026);
  });
  it("rolls over to next year for dates well in the past", () => {
    expect(inferYear(1, 23, today)).toBe(2027);
    expect(inferYear(3, 20, today)).toBe(2027);
  });
  it("treats dates within the 30-day grace window as this year (recent/ongoing)", () => {
    expect(inferYear(9, 20, today)).toBe(2026);
    expect(inferYear(9, 1, today)).toBe(2027);
  });
  it("uses the IST date at the year boundary", () => {
    // 31 Dec 23:30 IST: "Jan 2" is next year, "Dec 31" is today.
    const nye = fromIst("2026-12-31", "23:30");
    expect(inferYear(1, 2, nye)).toBe(2027);
    expect(inferYear(12, 31, nye)).toBe(2026);
    // 1 Jan 00:15 IST is still 31 Dec in UTC — must already count as 2027.
    const ny = fromIst("2027-01-01", "00:15");
    expect(ny.getUTCFullYear()).toBe(2026);
    expect(inferYear(1, 1, ny)).toBe(2027);
    expect(inferYear(12, 20, ny)).toBe(2026);
  });
});

describe("SerpApi date + time parsing", () => {
  it("parses start_date and a range time", () => {
    expect(parseSerpDate("Dec 13", "Sat, Dec 13, 7 – 10 PM", today)).toEqual({ date: "2026-12-13", time: "19:00" });
  });
  it("parses explicit minutes and meridiem", () => {
    expect(parseWhenTime("Fri, Nov 14, 5:30 PM – 11 PM")).toBe("17:30");
    expect(parseWhenTime("Sun, Jan 24, 12 PM")).toBe("12:00");
    expect(parseWhenTime("Sat, Dec 20, 12 – 2 AM")).toBe("00:00");
  });
  it("leaves time unknown when absent or ambiguous", () => {
    expect(parseWhenTime("Sat, Dec 13")).toBeNull();
    expect(parseWhenTime("Dec 13 – 14")).toBeNull();
    expect(parseSerpDate("Jan 23", "Jan 23 – 24", today)).toEqual({ date: "2027-01-23", time: null });
  });
  it("accepts 24h times and explicit years", () => {
    expect(parseWhenTime("Sat, Dec 13, 19:30")).toBe("19:30");
    expect(parseSerpDate("Mar 20", "Sat, Mar 20, 2027, 6 PM", today)).toEqual({ date: "2027-03-20", time: "18:00" });
  });
  it("falls back to `when` and rejects junk", () => {
    expect(parseSerpDate(undefined, "Thu, Nov 26, 8 PM", today)).toEqual({ date: "2026-11-26", time: "20:00" });
    expect(parseSerpDate("TBA", "Coming soon", today)).toBeNull();
  });
});

describe("city detection", () => {
  it("maps the four metros and their satellites", () => {
    expect(detectCity(["NICE Grounds", "Bengaluru, Karnataka"]).city).toBe("Bengaluru");
    expect(detectCity(["Phoenix Marketcity, Whitefield", "Bangalore, Karnataka"]).city).toBe("Bengaluru");
    expect(detectCity(["DY Patil Stadium, Nerul", "Navi Mumbai, Maharashtra"]).city).toBe("Mumbai");
    expect(detectCity(["Airia Mall", "Gurugram, Haryana"]).city).toBe("Delhi");
    expect(detectCity(["Expo Mart", "Greater Noida, Uttar Pradesh"]).city).toBe("Delhi");
    expect(detectCity(["Jawaharlal Nehru Stadium", "New Delhi, Delhi"]).city).toBe("Delhi");
    expect(detectCity(["The Music Academy", "Chennai, Tamil Nadu"]).city).toBe("Chennai");
  });
  it("uses the venue name when the address is thin", () => {
    expect(detectCity([], "Hard Rock Cafe Bangalore").city).toBe("Bengaluru");
  });
  it("falls back to the locality text and flags India", () => {
    expect(detectCity(["Khanapara Ground", "Guwahati, Assam"])).toEqual({ city: "Guwahati", inIndia: true });
    expect(detectCity(["Some Hall", "Mysuru, Karnataka"])).toEqual({ city: "Mysuru", inIndia: true });
    expect(detectCity(["O2 Arena", "London, UK"])).toEqual({ city: "London", inIndia: false });
  });
  it("buckets cities for filters", () => {
    expect(cityBucket("Mumbai")).toBe("Mumbai");
    expect(cityBucket("Pune")).toBe("Other");
  });
});

const ARTISTS = [
  { id: "A001", name: "Fred again..", aliases: ["Fred again", "FRED AGAIN", "Fred Again.."] },
  { id: "A004", name: "Guns N' Roses", aliases: ["Guns N Roses", "GNR"] },
  { id: "A017", name: "Fontaines D.C.", aliases: ["Fontaines DC"] },
  { id: "A026", name: "Stewart Copeland & Ricky Kej", aliases: ["Stewart Copeland", "Ricky Kej"] },
  { id: "A043", name: "Mali", aliases: [] },
  { id: "A007", name: "Anyma", aliases: ["Anyma AEDEN", "AEDEN"] },
  { id: "A054", name: "S. J. Jananiy", aliases: ["SJ Jananiy"] },
];

describe("alias matching", () => {
  it("is case and punctuation insensitive", () => {
    expect(aliasMatches("FRED AGAIN.. – India Tour 2026 | Bengaluru", ARTISTS).map((m) => m.artistId)).toEqual(["A001"]);
    expect(aliasMatches("Guns N’ Roses Live in Bengaluru", ARTISTS).map((m) => m.artistId)).toEqual(["A004"]);
    expect(aliasMatches("fontaines dc: romance tour", ARTISTS).map((m) => m.artistId)).toEqual(["A017"]);
    expect(aliasMatches("Anyma presents ÆDEN", ARTISTS).map((m) => m.artistId)).toEqual(["A007"]);
    expect(aliasMatches("S.J. Jananiy Carnatic Evening", ARTISTS).map((m) => m.artistId)).toEqual(["A054"]);
  });
  it("matches whole words only", () => {
    expect(aliasMatches("Somali Jazz Night", ARTISTS)).toEqual([]);
    expect(aliasMatches("Mali – Live at The Music Academy", ARTISTS).map((m) => m.artistId)).toEqual(["A043"]);
  });
  it("finds several artists in one lineup title", () => {
    expect(aliasMatches("Fred again.. with Mali and GNR", ARTISTS).map((m) => m.artistId).sort()).toEqual(["A001", "A004", "A043"]);
  });
  it("prefers the full duo name", () => {
    expect(aliasMatches("Stewart Copeland & Ricky Kej – Police Deranged", ARTISTS).map((m) => m.artistId)).toEqual(["A026"]);
  });
});

describe("text helpers", () => {
  it("normalises", () => {
    expect(normalize("  Guns N' Roses — LIVE!! ")).toBe("guns n roses live");
  });
  it("splits date labels out of event names", () => {
    expect(splitDateLabel("DGTL India 2026 (Nov 13–14, day TBA)")).toEqual({ name: "DGTL India 2026", dateLabel: "Nov 13–14, day TBA" });
    expect(splitDateLabel("Lollapalooza India 2027 (Day 1)")).toEqual({ name: "Lollapalooza India 2027 (Day 1)", dateLabel: null });
  });
  it("derives festival identity", () => {
    expect(festivalBaseName("Lollapalooza India 2027 (Day 1)")).toBe(festivalBaseName("Lollapalooza India 2027 (Jan 23–24, day TBA)"));
  });
  it("builds initials", () => {
    expect(initials("The Chainsmokers")).toBe("CH");
    expect(initials("Fred again..")).toBe("FA");
    expect(initials("5 Seconds of Summer")).toBe("5S");
  });
});
