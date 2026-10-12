import "server-only";
import { z } from "zod";
import { templateCopy, type Copy, type CopyInput } from "@/lib/alerts/templates";
import { copyViolations } from "@/lib/logic/copy-guard";
import { geminiJson } from "./gemini";
import { COPY_SYSTEM, copyUserPrompt } from "./prompts";

export interface CopyRequest extends CopyInput {
  venue: string | null;
  daysLeft: number | null; // days until the show
  earlyBird: string; // "open, closes within 6 hours" — qualitative only
  karanStatus: string | null;
}

const CopyArray = z.array(z.object({ i: z.number().int(), headline: z.string(), line: z.string() }));

/** One batched Gemini call for every alert in a scan; per-item template fallback. */
export async function generateCopy(reqs: readonly CopyRequest[]): Promise<(Copy & { by: "gemini" | "template" })[]> {
  const fallback = reqs.map((r) => ({ ...templateCopy(r), by: "template" as const }));
  if (reqs.length === 0) return fallback;
  const items = reqs.map((r, i) => ({
    i,
    type: r.type,
    urgency: r.urgency,
    artist: r.artist,
    karan_priority: r.priority,
    city: r.city,
    festival: r.festivalName ?? null,
    artists_at_festival: r.artistCount ?? null,
    days_until_show: r.daysLeft,
    early_bird: r.earlyBird,
    karan_status: r.karanStatus,
  }));
  const res = await geminiJson({ label: `alert copy ×${reqs.length}`, system: COPY_SYSTEM, prompt: copyUserPrompt(items), schema: CopyArray });
  if (!res.ok) return fallback;
  return reqs.map((r, i) => {
    const c = res.data.find((x) => x.i === i);
    if (!c) return fallback[i];
    const headline = c.headline.trim();
    const line = c.line.trim();
    if (!headline.toLowerCase().includes(r.artist.split(",")[0].toLowerCase().slice(0, 4)) && r.type !== "festival") return fallback[i];
    if (copyViolations(headline, line, r.venue).length > 0) return fallback[i];
    return { headline, line, by: "gemini" as const };
  });
}

/** Qualitative early-bird description for the AI (no numbers, so it cannot echo them). */
export function qualitativeEarlyBird(state: string, msLeft: number | null): string {
  if (state === "open" && msLeft !== null) {
    if (msLeft <= 12 * 3600_000) return "open, closes within hours";
    if (msLeft <= 48 * 3600_000) return "open, closes within two days";
    return "open";
  }
  if (state === "upcoming") return "opens soon";
  if (state === "sold_out") return "sold out";
  if (state === "closed") return "closed";
  return "not announced";
}
