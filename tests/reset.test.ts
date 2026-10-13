import { describe, expect, it } from "vitest";
import { resetDue } from "@/lib/logic/reset";
import { fromIst } from "@/lib/time";

describe("daily reset due (IST calendar day)", () => {
  it("is due when it last ran before midnight IST — the 23:40 IST cron case", () => {
    expect(resetDue(fromIst("2026-10-12", "23:40"), fromIst("2026-10-13", "00:05"))).toBe(true);
  });
  it("is not due again the same IST day", () => {
    expect(resetDue(fromIst("2026-10-13", "00:31"), fromIst("2026-10-13", "13:00"))).toBe(false);
  });
  it("uses IST, not UTC: 00:30 IST is still the previous UTC day", () => {
    const ran = fromIst("2026-10-13", "00:30"); // 2026-10-12 19:00 UTC
    expect(ran.getUTCDate()).toBe(12);
    expect(resetDue(ran, fromIst("2026-10-13", "23:59"))).toBe(false);
  });
  it("is due when it never ran", () => {
    expect(resetDue(null, new Date())).toBe(true);
  });
});
