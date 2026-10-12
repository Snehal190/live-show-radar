import { describe, expect, it } from "vitest";
import {
  chooseTicketSource,
  cityRuleSendsAlert,
  ebState,
  fomoStats,
  groupFestivalAnnouncements,
  idempotencyKey,
  isAlertable,
  isMissed,
  isNewlyAnnounced,
  newShowUrgency,
  pickSerpTicket,
  selectReminders,
  shouldNudge,
  siteNameFromUrl,
  type PastAlert,
  type ShowFacts,
} from "@/lib/logic/rules";
import { fromIst } from "@/lib/time";

const RULES = [
  { city: "Bengaluru", priority: "*", sendsAlert: true },
  { city: "Mumbai", priority: "Must-see", sendsAlert: true },
  { city: "Mumbai", priority: "Like", sendsAlert: false },
  { city: "Chennai", priority: "Must-see", sendsAlert: true },
  { city: "Chennai", priority: "Like", sendsAlert: false },
  { city: "*", priority: "*", sendsAlert: false },
];

const now = fromIst("2026-10-12", "13:05");

function show(p: Partial<ShowFacts> = {}): ShowFacts {
  return {
    id: 1,
    city: "Bengaluru",
    eventName: "Kayan – Bengaluru Night (demo)",
    eventType: "Concert",
    startsAt: fromIst("2026-11-05", "19:30"),
    announcedAt: fromIst("2026-10-12", "13:00"),
    ebOpensAt: null,
    ebClosesAt: null,
    ebStatusOverride: null,
    generalStatus: "On sale",
    karanStatus: null,
    ...p,
  };
}

function alert(type: PastAlert["type"], at: Date, urgency: PastAlert["urgency"] = "high", isHistorical = false): PastAlert {
  return { type, createdAt: at, urgency, isHistorical };
}

describe("city rule", () => {
  it("alerts every Bengaluru artist", () => {
    expect(cityRuleSendsAlert("Bengaluru", "Like", RULES)).toBe(true);
    expect(cityRuleSendsAlert("Bengaluru", "Must-see", RULES)).toBe(true);
  });
  it("alerts Mumbai/Chennai only for Must-see", () => {
    expect(cityRuleSendsAlert("Mumbai", "Must-see", RULES)).toBe(true);
    expect(cityRuleSendsAlert("Mumbai", "Like", RULES)).toBe(false);
    expect(cityRuleSendsAlert("Chennai", "Must-see", RULES)).toBe(true);
    expect(cityRuleSendsAlert("Chennai", "Like", RULES)).toBe(false);
  });
  it("keeps every other city visible-only", () => {
    expect(cityRuleSendsAlert("Delhi", "Must-see", RULES)).toBe(false);
    expect(cityRuleSendsAlert("Pune", "Must-see", RULES)).toBe(false);
    expect(cityRuleSendsAlert("Shillong", "Like", RULES)).toBe(false);
  });
  it("keeps reminders for shows Karan committed to in other cities", () => {
    expect(isAlertable({ city: "Delhi", karanStatus: null }, "Must-see", RULES)).toBe(false);
    expect(isAlertable({ city: "Delhi", karanStatus: "going" }, "Like", RULES)).toBe(true);
  });
});

describe("early-bird state", () => {
  const eb = { ebOpensAt: fromIst("2026-10-12", "13:00"), ebClosesAt: fromIst("2026-10-12", "19:00"), ebStatusOverride: null };
  it("walks upcoming → open → closed", () => {
    expect(ebState(eb, fromIst("2026-10-12", "12:59"))).toBe("upcoming");
    expect(ebState(eb, fromIst("2026-10-12", "13:00"))).toBe("open");
    expect(ebState(eb, fromIst("2026-10-12", "19:00"))).toBe("closed");
  });
  it("honours sold-out and missing tiers", () => {
    expect(ebState({ ...eb, ebStatusOverride: "Sold out" }, now)).toBe("sold_out");
    expect(ebState({ ebOpensAt: null, ebClosesAt: null, ebStatusOverride: null }, now)).toBe("none");
  });
});

describe("urgency", () => {
  it("Bengaluru + Must-see new show is critical", () => {
    expect(newShowUrgency(show(), "Must-see", now)).toBe("critical");
  });
  it("other new shows are high", () => {
    expect(newShowUrgency(show(), "Like", now)).toBe("high");
    expect(newShowUrgency(show({ city: "Mumbai" }), "Must-see", now)).toBe("high");
  });
  it("an early-bird closing within 48h makes it critical anywhere", () => {
    const s = show({ city: "Chennai", ebOpensAt: fromIst("2026-10-12", "13:00"), ebClosesAt: fromIst("2026-10-13", "19:00") });
    expect(newShowUrgency(s, "Must-see", now)).toBe("critical");
  });
});

describe("idempotency key", () => {
  it("is show:type:IST date", () => {
    expect(idempotencyKey(42, "new_show", now)).toBe("42:new_show:2026-10-12");
  });
  it("switches day at IST midnight, not UTC midnight", () => {
    expect(idempotencyKey(42, "eb_live", fromIst("2026-10-12", "23:59"))).toBe("42:eb_live:2026-10-12");
    expect(idempotencyKey(42, "eb_live", fromIst("2026-10-13", "00:01"))).toBe("42:eb_live:2026-10-13");
    // 00:01 IST is 18:31 UTC of the previous day.
    expect(fromIst("2026-10-13", "00:01").getUTCDate()).toBe(12);
  });
});

describe("Detector", () => {
  it("fires once the announcement time has passed and never twice", () => {
    const s = show({ announcedAt: fromIst("2026-10-12", "15:00") });
    expect(isNewlyAnnounced(s, [], fromIst("2026-10-12", "14:59"))).toBe(false);
    expect(isNewlyAnnounced(s, [], fromIst("2026-10-12", "15:00"))).toBe(true);
    expect(isNewlyAnnounced(s, [alert("new_show", fromIst("2026-10-12", "15:00"))], fromIst("2026-10-12", "15:05"))).toBe(false);
    expect(isNewlyAnnounced(s, [alert("festival", fromIst("2026-10-12", "15:00"))], fromIst("2026-10-12", "15:05"))).toBe(false);
  });

  it("groups two of Karan's artists at one festival into one alert", () => {
    const a = show({ id: 16, eventType: "Festival", eventName: "Whitefield Indie Fest (demo festival)" });
    const b = show({ id: 17, eventType: "Festival", eventName: "Whitefield Indie Fest (demo festival)" });
    const lone = show({ id: 5, eventType: "Festival", eventName: "Bengaluru Monsoon Sessions (demo festival)" });
    const concert = show({ id: 9 });
    const out = groupFestivalAnnouncements([a, b, lone, concert], [a, b, lone]);
    expect(out.festivals).toHaveLength(1);
    expect(out.festivals[0].shows.map((s) => s.id)).toEqual([16, 17]);
    expect(out.singles.map((s) => s.id).sort()).toEqual([5, 9]);
  });

  it("treats Day-1 and date-TBA rows of the same festival + city + date as one festival", () => {
    const a = show({ id: 1, eventType: "Festival", eventName: "Lollapalooza India 2027 (Day 1)", city: "Mumbai", startsAt: fromIst("2027-01-23") });
    const b = show({ id: 2, eventType: "Festival", eventName: "Lollapalooza India 2027", city: "Mumbai", startsAt: fromIst("2027-01-23") });
    const otherDay = show({ id: 3, eventType: "Festival", eventName: "Lollapalooza India 2027 (Day 2)", city: "Mumbai", startsAt: fromIst("2027-01-24") });
    const out = groupFestivalAnnouncements([a, b, otherDay], [a, b, otherDay]);
    expect(out.festivals.map((f) => f.shows.map((s) => s.id))).toEqual([[1, 2]]);
    expect(out.singles.map((s) => s.id)).toEqual([3]);
  });

  it("alerts a lineup addition as a festival alert when a sibling was already announced", () => {
    const old = show({ id: 1, eventType: "Festival", eventName: "DGTL India 2026" });
    const added = show({ id: 2, eventType: "Festival", eventName: "DGTL India 2026" });
    const out = groupFestivalAnnouncements([added], [old, added]);
    expect(out.festivals[0]).toMatchObject({ siblingCount: 2 });
    expect(out.festivals[0].shows.map((s) => s.id)).toEqual([2]);
  });
});

describe("Reminder", () => {
  it("13:00 drop with a 6-hour early-bird: no separate eb_live/eb_closing after the new-show alert", () => {
    const s = show({ ebOpensAt: fromIst("2026-10-12", "13:00"), ebClosesAt: fromIst("2026-10-12", "19:00") });
    const past = [alert("new_show", fromIst("2026-10-12", "13:05"), "critical")];
    expect(selectReminders(s, past, fromIst("2026-10-12", "13:10"))).toEqual([]);
  });

  it("eb_live fires when the early-bird opened today and Karan was told before it opened", () => {
    const s = show({ ebOpensAt: fromIst("2026-10-13", "12:00"), ebClosesAt: fromIst("2026-10-15", "23:59"), karanStatus: "interested" });
    const past = [alert("new_show", fromIst("2026-10-12", "15:00"))];
    expect(selectReminders(s, past, fromIst("2026-10-13", "11:59"))).toEqual([]);
    expect(selectReminders(s, past, fromIst("2026-10-13", "12:05"))).toEqual(["eb_live"]);
    expect(selectReminders(s, [...past, alert("eb_live", fromIst("2026-10-13", "12:05"))], fromIst("2026-10-13", "12:10"))).toEqual([]);
  });

  it("eb_closing fires inside 48h unless already told inside that window", () => {
    const s = show({ ebOpensAt: fromIst("2026-10-11", "11:00"), ebClosesAt: fromIst("2026-10-13", "23:00"), karanStatus: "interested" });
    const oldAnnounce = [alert("new_show", fromIst("2026-10-11", "11:00"), "high", true)];
    expect(selectReminders(s, oldAnnounce, fromIst("2026-10-12", "00:05"))).toEqual(["eb_closing"]);
    const toldInWindow = [...oldAnnounce, alert("eb_closing", fromIst("2026-10-12", "00:05"), "critical")];
    expect(selectReminders(s, toldInWindow, fromIst("2026-10-12", "06:00"))).toEqual([]);
  });

  it("decide_soon at ≤14 days with no status, once", () => {
    const s = show({ startsAt: fromIst("2026-10-24", "19:00"), announcedAt: fromIst("2026-10-10", "18:00") });
    const past = [alert("new_show", fromIst("2026-10-10", "18:00"), "high", true)];
    expect(selectReminders(s, past, now)).toEqual(["decide_soon"]);
    expect(selectReminders(s, [...past, alert("decide_soon", now, "medium")], now)).toEqual([]);
    expect(selectReminders(show({ startsAt: fromIst("2026-10-30", "19:00") }), past, now)).toEqual([]);
  });

  it("decide_soon is folded into a fresh announcement", () => {
    const s = show({ startsAt: fromIst("2026-10-20", "19:00") });
    expect(selectReminders(s, [alert("new_show", fromIst("2026-10-12", "13:00"))], now)).toEqual([]);
  });

  it("show_week exactly 7 IST days out and tonight on the day, Going only", () => {
    const week = show({ startsAt: fromIst("2026-10-19", "19:00"), karanStatus: "going" });
    expect(selectReminders(week, [], fromIst("2026-10-12", "00:05"))).toEqual(["show_week"]);
    expect(selectReminders({ ...week, karanStatus: "interested" }, [], fromIst("2026-10-12", "00:05"))).toEqual([]);
    const tonight = show({ startsAt: fromIst("2026-10-12", "21:00"), karanStatus: "going" });
    expect(selectReminders(tonight, [], fromIst("2026-10-12", "00:05"))).toEqual(["tonight"]);
  });

  it("skipped silences everything", () => {
    const s = show({ karanStatus: "skipped", ebOpensAt: fromIst("2026-10-12", "10:00"), ebClosesAt: fromIst("2026-10-13", "10:00"), startsAt: fromIst("2026-10-15") });
    expect(selectReminders(s, [], now)).toEqual([]);
    expect(shouldNudge(s, [alert("eb_closing", fromIst("2026-10-12", "00:00"), "critical")], now)).toBe(false);
  });

  it("missed: passed or sold out with no action, dashboard-only info", () => {
    const passed = show({ startsAt: fromIst("2026-10-02", "20:00") });
    expect(isMissed(passed, now)).toBe(true);
    expect(selectReminders(passed, [], now)).toEqual(["missed"]);
    expect(selectReminders(passed, [alert("missed", now, "info")], now)).toEqual([]);
    expect(isMissed({ ...passed, karanStatus: "going" }, now)).toBe(false);
    expect(isMissed(show({ generalStatus: "Sold out" }), now)).toBe(true);
  });
});

describe("Smart nudge", () => {
  const s = show({ ebOpensAt: fromIst("2026-10-11", "11:00"), ebClosesAt: fromIst("2026-10-13", "23:00") });
  const critical = alert("eb_closing", fromIst("2026-10-12", "00:05"), "critical");
  it("fires after 6h without action while the early-bird is open", () => {
    expect(shouldNudge(s, [critical], fromIst("2026-10-12", "06:04"))).toBe(false);
    expect(shouldNudge(s, [critical], fromIst("2026-10-12", "06:05"))).toBe(true);
  });
  it("fires once per show", () => {
    expect(shouldNudge(s, [critical, alert("nudge", fromIst("2026-10-12", "06:05"), "critical")], fromIst("2026-10-12", "12:00"))).toBe(false);
  });
  it("needs no action, an open early-bird, and a real (non-historical) critical alert", () => {
    expect(shouldNudge({ ...s, karanStatus: "interested" }, [critical], fromIst("2026-10-12", "07:00"))).toBe(false);
    expect(shouldNudge(s, [critical], fromIst("2026-10-13", "23:30"))).toBe(false);
    expect(shouldNudge(s, [alert("new_show", fromIst("2026-10-10"), "critical", true)], fromIst("2026-10-12", "07:00"))).toBe(false);
  });
});

describe("where to buy", () => {
  it("1. uses the SerpApi ticket_info source name", () => {
    expect(chooseTicketSource({ serpTicketSource: "District", serpTicketUrl: "https://www.district.in/e/1", ticketPlatform: "BookMyShow" })).toMatchObject({
      platform: "District",
      label: "Tickets via District · found by SerpApi Google Events",
      via: "serpapi",
    });
  });
  it("2. falls back to the SerpApi link's site name", () => {
    expect(chooseTicketSource({ serpTicketSource: null, serpTicketUrl: "https://in.bookmyshow.com/events/x", ticketPlatform: null })).toMatchObject({
      platform: "BookMyShow",
      via: "serpapi_link",
    });
    expect(siteNameFromUrl("https://www.skillboxes.com/events/abc")).toBe("Skillbox");
    expect(siteNameFromUrl("https://tickets.example.org/x")).toBe("Tickets");
  });
  it("3. then the known platform, 4. then BookMyShow", () => {
    expect(chooseTicketSource({ serpTicketSource: null, serpTicketUrl: null, ticketPlatform: "District" })).toMatchObject({ platform: "District", via: "known" });
    expect(chooseTicketSource({ serpTicketSource: null, serpTicketUrl: null, ticketPlatform: null })).toMatchObject({ label: "Check BookMyShow", via: "fallback" });
  });
  it("prefers ticket links over info links in ticket_info", () => {
    expect(
      pickSerpTicket([
        { source: "Allevents", link: "https://allevents.in/x", link_type: "more info" },
        { source: "BookMyShow", link: "https://in.bookmyshow.com/x", link_type: "tickets" },
      ]),
    ).toEqual({ source: "BookMyShow", link: "https://in.bookmyshow.com/x" });
    expect(pickSerpTicket(undefined)).toEqual({ source: null, link: null });
  });
});

describe("FOMO maths", () => {
  const base = { ebPriceInr: null, generalPriceInr: null, announcedAt: fromIst("2026-10-01", "12:00"), statusChangedAt: null, missed: false };
  it("counts caught, missed, early-birds and money saved", () => {
    const stats = fomoStats([
      { ...base, karanStatus: "going", bookedTier: "early_bird", ebPriceInr: 1299, generalPriceInr: 2199, statusChangedAt: fromIst("2026-10-01", "14:00") },
      { ...base, karanStatus: "going", bookedTier: "general", ebPriceInr: 999, generalPriceInr: 1699, statusChangedAt: fromIst("2026-10-02", "18:00") },
      { ...base, karanStatus: null, bookedTier: null, missed: true },
      { ...base, karanStatus: "interested", bookedTier: null, statusChangedAt: fromIst("2026-10-01", "20:00") },
    ]);
    expect(stats).toEqual({ caught: 2, missed: 1, earlyBirds: 1, moneySavedInr: 900, avgHoursToAction: 13.3, score: 67 });
  });
  it("handles an empty history", () => {
    expect(fomoStats([])).toEqual({ caught: 0, missed: 0, earlyBirds: 0, moneySavedInr: 0, avgHoursToAction: null, score: 100 });
  });
});
