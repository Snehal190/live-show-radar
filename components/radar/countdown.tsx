"use client";

import { useNow } from "./use-now";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to an ISO instant. Renders a stable placeholder until mounted (no hydration drift). */
export function Countdown({ to, prefix, done = "now", compact = false }: { to: string; prefix?: string; done?: string; compact?: boolean }) {
  const now = useNow();
  if (now === null) return <span className="tabular-nums opacity-60">{prefix} …</span>;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span>{done}</span>;
  const { d, h, m, s } = parts(ms);
  const text = compact
    ? d > 0
      ? `${d}d ${h}h`
      : h > 0
        ? `${h}h ${m}m`
        : `${m}m ${String(s).padStart(2, "0")}s`
    : d > 0
      ? `${d}d ${h}h ${m}m`
      : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return (
    <span className="tabular-nums">
      {prefix ? `${prefix} ` : ""}
      {text}
    </span>
  );
}
