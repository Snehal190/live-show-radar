import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_EMAIL, isAlreadyAccepted, shouldEmail } from "@/lib/alerts/email-policy";

describe("email policy", () => {
  it("always emails Detector alerts (new show, festival), whatever Karan chose", () => {
    for (const s of [null, "interested", "going", "skipped"] as const) {
      expect(shouldEmail("new_show", s)).toBe(true);
      expect(shouldEmail("festival", s)).toBe(true);
    }
  });
  it("emails reminders only for shows Karan asked to be reminded about (Remind me / Going)", () => {
    for (const t of ["eb_live", "eb_closing", "nudge", "decide_soon", "show_week", "tonight", "eb_sold_out"]) {
      expect(shouldEmail(t, "interested"), t).toBe(true);
      expect(shouldEmail(t, "going"), t).toBe(true);
      expect(shouldEmail(t, null), t).toBe(false);
      expect(shouldEmail(t, "skipped"), t).toBe(false);
    }
  });
  it("never emails 'missed'", () => {
    expect(shouldEmail("missed", "interested")).toBe(false);
  });
  it("sends to Karan's inbox by default", () => {
    expect(DEFAULT_ALERT_EMAIL).toBe("snehalbandi5@gmail.com");
  });
  it("treats Resend's reused-key rejection as already delivered", () => {
    expect(isAlreadyAccepted("invalid_idempotent_request: This idempotency key has been used with this HTTP method and endpoint within the last 24 hours, but the request body was modified")).toBe(true);
    expect(isAlreadyAccepted("rate_limit_exceeded: Too many requests")).toBe(false);
  });
});
