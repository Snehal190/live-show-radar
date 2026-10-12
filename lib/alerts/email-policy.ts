import type { AlertKind, KaranStatus } from "@/lib/logic/rules";

/** Karan's inbox. Used when ALERT_EMAIL is not set, so alerts never go nowhere. */
export const DEFAULT_ALERT_EMAIL = "snehalbandi5@gmail.com";

/** Detector alerts: always emailed — the "never miss an announcement" promise. */
export const DETECTOR_EMAIL_TYPES = ["new_show", "festival"] as const satisfies readonly AlertKind[];

/** Reminder alerts: emailed only for shows Karan asked to be reminded about (Remind me / Going). */
export const REMINDER_EMAIL_TYPES = [
  "eb_live",
  "eb_closing",
  "nudge",
  "eb_sold_out",
  "general_sold_out",
  "decide_soon",
  "show_week",
  "tonight",
] as const satisfies readonly AlertKind[];

/** Statuses that opt a show into reminder emails ("interested" is the Remind me button). */
export const REMINDER_OPT_IN: readonly NonNullable<KaranStatus>[] = ["interested", "going"];

export const MAX_EMAIL_ATTEMPTS = 5;

export function isDetectorType(type: string): boolean {
  return (DETECTOR_EMAIL_TYPES as readonly string[]).includes(type);
}

/** Should this alert go to the inbox, given what Karan chose for the show? Everything else stays in-app. */
export function shouldEmail(type: string, status: KaranStatus | undefined): boolean {
  if (isDetectorType(type)) return true;
  if (!(REMINDER_EMAIL_TYPES as readonly string[]).includes(type)) return false;
  return status === "interested" || status === "going";
}

/**
 * Resend rejects a reused idempotency key whose body changed. Keys are unique per alert row,
 * so this only happens when the same alert is retried after Resend already accepted it
 * (the countdown text in the body changes between attempts): it was delivered, not failed.
 */
export function isAlreadyAccepted(error: string): boolean {
  return /invalid_idempotent_request|idempotency key has been used/i.test(error);
}
