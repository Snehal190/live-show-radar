import type { ShowView } from "@/lib/server/views";

type Tone = "ok" | "blue" | "warn" | "light";
const DOT: Record<Tone, string> = { ok: "#62c073", blue: "#52a8ff", warn: "#999999", light: "#ededed" };

/** The one status indicator: pill, #1f1f1f, coloured dot, mono uppercase label. */
export function Chip({ tone = "warn", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className="v-chip" title={title}>
      <span className="v-dot" style={{ background: DOT[tone] }} />
      {children}
    </span>
  );
}

export function SourceBadge({ show }: { show: Pick<ShowView, "source" | "serpFetchedAt"> }) {
  switch (show.source) {
    case "serpapi":
      return <Chip tone="blue">Google Events</Chip>;
    case "gemini_web":
      return <Chip tone="light">Web find</Chip>;
    case "known":
      return <Chip tone="ok">Confirmed</Chip>;
    case "demo":
      return null;
  }
}

export function SimulatedBadge() {
  return (
    <Chip tone="warn" title="This early-bird window is simulated; it is not from the ticketing site.">
      Sim. early-bird
    </Chip>
  );
}

const URGENCY_TONE: Record<string, Tone> = { critical: "blue", high: "light", medium: "warn", low: "warn", info: "warn" };

export function UrgencyPill({ urgency }: { urgency: string }) {
  return <Chip tone={URGENCY_TONE[urgency] ?? "warn"}>{urgency}</Chip>;
}

const VERDICT: Record<string, { label: string; tone: Tone }> = {
  go: { label: "Worth the trip", tone: "ok" },
  think: { label: "Think about it", tone: "light" },
  skip: { label: "Skip the trip", tone: "warn" },
};

export function VerdictChip({ verdict, reason, by }: { verdict: string; reason?: string | null; by?: string | null }) {
  const v = VERDICT[verdict];
  if (!v) return null;
  return (
    <Chip tone={v.tone} title={`${reason ?? ""}${by ? ` (by ${by === "gemini" ? "Gemini Flash" : "rules fallback"})` : ""}`}>
      {v.label}
    </Chip>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return priority === "Must-see" ? <Chip tone="blue">Must-see</Chip> : null;
}

export function StatusBadge({ status, tier }: { status: string | null; tier?: string | null }) {
  if (!status) return null;
  if (status === "going") return <Chip tone="ok">{tier === "early_bird" ? "Going · EB" : "Going"}</Chip>;
  if (status === "interested") return <Chip tone="light">Reminder on</Chip>;
  return <Chip tone="warn">Skipped</Chip>;
}
