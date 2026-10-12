/**
 * Timeline progress bar: a fixed window (default the next 14 days) with an absolute bar whose
 * left/width show when the early-bird is open. Blue when it is open right now.
 */
export function TimelineBar({ from, to, now, windowDays = 14, active }: { from: string | null; to: string | null; now: number; windowDays?: number; active: boolean }) {
  if (!from && !to) return <div className="h-1.5 w-full rounded-sm bg-white/[0.04]" />;
  const span = windowDays * 86_400_000;
  const start = from ? new Date(from).getTime() : now;
  const end = to ? new Date(to).getTime() : start + 86_400_000;
  const left = Math.max(0, Math.min(100, ((start - now) / span) * 100));
  const right = Math.max(0, Math.min(100, ((end - now) / span) * 100));
  const width = Math.max(1.5, right - left);
  return (
    <div className="relative h-1.5 w-full rounded-sm bg-white/[0.04]" aria-hidden>
      <div className="absolute inset-y-0 rounded-sm" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, background: active ? "#52a8ff" : "rgba(255,255,255,0.18)" }} />
    </div>
  );
}
