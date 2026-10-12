export interface VerdictFacts {
  priority: "Must-see" | "Like";
  weekend: boolean;
  clashesWithGoing: boolean;
  alsoPlaysBengaluru: boolean;
  daysOfNotice: number;
  genre: string | null;
}

export interface Verdict {
  verdict: "go" | "think" | "skip";
  reason: string;
}

/** Non-AI Worth-the-trip fallback. Same inputs Gemini gets, simple and explainable. */
export function ruleVerdict(f: VerdictFacts): Verdict {
  if (f.alsoPlaysBengaluru) return { verdict: "skip", reason: "Ye Bengaluru bhi aa rahe hain — flight ka paisa bacha, ghar pe dekh le." };
  if (f.clashesWithGoing) return { verdict: "think", reason: "Clash hai ek show se jo already booked hai. Priority set kar pehle." };
  if (f.priority === "Must-see" && f.weekend && f.daysOfNotice >= 10) return { verdict: "go", reason: "Must-see, weekend, aur planning ka time bhi hai. Bag pack kar. ✈️" };
  if (f.priority === "Must-see" && f.daysOfNotice < 10) return { verdict: "think", reason: "Must-see hai, par notice kam hai. Leave aur tickets dono check kar." };
  if (f.priority === "Must-see") return { verdict: "think", reason: "Must-see hai, par weekday show hai. Leave mil jaye toh pakka jaa." };
  return { verdict: "skip", reason: "Pasand hai, par trip ke layak nahi lagta. Next Bengaluru show ka wait kar." };
}
