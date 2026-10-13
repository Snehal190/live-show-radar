import { istDate } from "@/lib/time";

/** The daily reset is due when it hasn't run yet on the current IST calendar day. */
export function resetDue(lastResetAt: Date | null, now: Date): boolean {
  return lastResetAt === null || istDate(lastResetAt) < istDate(now);
}
