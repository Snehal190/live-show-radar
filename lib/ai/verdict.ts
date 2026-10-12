import "server-only";
import { z } from "zod";
import { copyViolations } from "@/lib/logic/copy-guard";
import { ruleVerdict, type Verdict, type VerdictFacts } from "@/lib/logic/verdict";
import { geminiJson } from "./gemini";
import { VERDICT_SYSTEM, verdictUserPrompt } from "./prompts";

export interface VerdictRequest extends VerdictFacts {
  artist: string;
  city: string;
  venue: string | null;
}

const VerdictArray = z.array(z.object({ i: z.number().int(), verdict: z.enum(["go", "think", "skip"]), reason: z.string().min(3).max(240) }));

/** Worth-the-trip verdicts for Mumbai/Chennai Must-see shows. One batched call, rule fallback. */
export async function generateVerdicts(reqs: readonly VerdictRequest[]): Promise<(Verdict & { by: "gemini" | "rules" })[]> {
  const fallback = reqs.map((r) => ({ ...ruleVerdict(r), by: "rules" as const }));
  if (reqs.length === 0) return fallback;
  const res = await geminiJson({
    label: `worth-the-trip ×${reqs.length}`,
    system: VERDICT_SYSTEM,
    prompt: verdictUserPrompt(
      reqs.map((r, i) => ({
        i,
        artist: r.artist,
        city: r.city,
        priority: r.priority,
        weekend_show: r.weekend,
        clashes_with_a_show_karan_is_going_to: r.clashesWithGoing,
        same_artist_also_plays_bengaluru: r.alsoPlaysBengaluru,
        days_of_notice: r.daysOfNotice,
        genre: r.genre,
      })),
    ),
    schema: VerdictArray,
  });
  if (!res.ok) return fallback;
  return reqs.map((r, i) => {
    const v = res.data.find((x) => x.i === i);
    if (!v || copyViolations("verdict", v.reason, r.venue).length > 0) return fallback[i];
    return { verdict: v.verdict, reason: v.reason.trim(), by: "gemini" as const };
  });
}
