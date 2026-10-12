"use client";

import { Bell, Check, Ticket, X } from "lucide-react";
import { useState, useTransition } from "react";
import { setShowStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

type Action = "going_early_bird" | "going_general" | "interested" | "skipped" | "clear";

export function StatusButtons({
  showId,
  status,
  tier,
  ebAvailable,
  past,
}: {
  showId: number;
  status: "going" | "interested" | "skipped" | null;
  tier: "early_bird" | "general" | null;
  ebAvailable: boolean;
  past: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{ status: typeof status; tier: typeof tier } | null>(null);
  const cur = optimistic ?? { status, tier };

  const celebrate = (el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect();
    const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.6 };
    void import("canvas-confetti").then(({ default: confetti }) =>
      confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin, colors: ["#ffe08a", "#ff8f8f", "#52a8ff", "#62c073", "#ffffff"], disableForReducedMotion: true }),
    );
  };

  const run = (action: Action, el?: HTMLElement | null) => {
    const isActive =
      (action === "going_early_bird" && cur.status === "going" && cur.tier === "early_bird") ||
      (action === "going_general" && cur.status === "going" && cur.tier === "general") ||
      (action === "interested" && cur.status === "interested") ||
      (action === "skipped" && cur.status === "skipped");
    const next: Action = isActive ? "clear" : action;
    if (next === "going_early_bird" || next === "going_general") celebrate(el ?? null);
    setError(null);
    setOptimistic(
      next === "clear"
        ? { status: null, tier: null }
        : next === "going_early_bird"
          ? { status: "going", tier: "early_bird" }
          : next === "going_general"
            ? { status: "going", tier: "general" }
            : { status: next, tier: null },
    );
    start(async () => {
      const res = await setShowStatus({ showId, action: next });
      if (!res.ok) {
        setError(res.error);
        setOptimistic(null);
      }
    });
  };

  if (past) return null;
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#52a8ff]";
  // Selected states in the concert palette: going = gold ticket, interested = coral, skip = muted.
  const onGoing = "bg-[#ffe08a] text-[#121212] shadow-[0_0_18px_-4px_rgba(255,214,90,0.7)]";
  const onInterested = "bg-[#ff8f8f] text-[#121212] shadow-[0_0_18px_-4px_rgba(255,143,143,0.6)]";
  const onSkip = "bg-[#2a2a2a] text-[#999] line-through";
  const off = "bg-transparent text-[#ededed] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:bg-white/5";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5" aria-busy={pending}>
        {ebAvailable && (
          <button type="button" disabled={pending} onClick={(e) => run("going_early_bird", e.currentTarget)} className={cn(btn, cur.status === "going" && cur.tier === "early_bird" ? onGoing : "bg-white text-[#121212] hover:bg-[#e7e7e7]")}>
            <Ticket className="size-3.5" /> Got early-bird
          </button>
        )}
        <button type="button" disabled={pending} onClick={(e) => run("going_general", e.currentTarget)} className={cn(btn, cur.status === "going" && cur.tier === "general" ? onGoing : ebAvailable ? off : "bg-white text-[#121212] hover:bg-[#e7e7e7]")}>
          <Check className="size-3.5" /> Going{ebAvailable ? " (general)" : ""}
        </button>
        <button type="button" disabled={pending} onClick={() => run("interested")} className={cn(btn, cur.status === "interested" ? onInterested : off)}>
          <Bell className="size-3.5" /> {cur.status === "interested" ? "Reminding" : "Remind me"}
        </button>
        <button type="button" disabled={pending} onClick={() => run("skipped")} className={cn(btn, cur.status === "skipped" ? onSkip : off)}>
          <X className="size-3.5" /> Skip
        </button>
      </div>
      {error && <p className="font-mono text-xs text-[#ededed]">{error}</p>}
    </div>
  );
}
