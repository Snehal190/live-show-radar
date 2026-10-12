"use client";

import Link from "next/link";
import { useState } from "react";
import type { ShowView } from "@/lib/server/views";
import { cn } from "@/lib/utils";
import { ArtistTile } from "./artist-tile";
import { Chip, StatusBadge } from "./badges";
import { TimelineBar } from "./timeline-bar";
import { useNow } from "./use-now";

export interface StreamTab {
  id: string;
  label: string;
  dot: string;
  rows: ShowView[];
}

const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

function ebLabel(s: ShowView, now: number): string {
  const left = (iso: string) => {
    const ms = new Date(iso).getTime() - now;
    const h = Math.floor(ms / 3_600_000);
    return h >= 48 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
  };
  if (s.ebState === "open" && s.ebClosesAt) return `OPEN · ${left(s.ebClosesAt)} LEFT`;
  if (s.ebState === "upcoming" && s.ebOpensAt) return `OPENS IN ${left(s.ebOpensAt)}`;
  if (s.ebState === "sold_out") return "SOLD OUT";
  if (s.ebState === "closed") return "CLOSED";
  return "—";
}

/** "Event stream": left sidebar of views with counts, right a mono table with an early-bird timeline. */
export function EventStream({ tabs }: { tabs: StreamTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const tick = useNow();
  const now = tick ?? Date.parse(tabs[0]?.rows[0]?.announcedAt ?? "2026-01-01");
  return (
    <div className="tech-card overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="font-mono text-xs text-[#ededed]">stream/{tab?.id.toLowerCase()}</span>
        <span className="v-chip">{tab?.rows.length ?? 0} shows</span>
        <span className="v-chip">
          <span className="v-dot" style={{ background: "#52a8ff" }} />
          early-bird window · next 14d
        </span>
      </div>
      <div className="grid md:grid-cols-[240px_1fr]">
        <aside className="no-scrollbar flex gap-1 overflow-x-auto border-b border-white/10 p-2 md:flex-col md:overflow-visible md:border-r md:border-b-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              aria-pressed={t.id === tab?.id}
              className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left font-mono text-xs transition-colors", t.id === tab?.id ? "bg-white/[0.07] text-white" : "text-[#999] hover:bg-white/[0.03] hover:text-white")}
            >
              <span className="v-dot" style={{ background: t.dot }} />
              <span className="flex-1 uppercase">{t.label}</span>
              <span className="text-[#666]">{t.rows.length}</span>
            </button>
          ))}
        </aside>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="font-mono text-[11px] tracking-wider text-[#666] uppercase">
                <th className="px-4 py-2.5 font-normal">Show</th>
                <th className="px-3 py-2.5 font-normal">City</th>
                <th className="px-3 py-2.5 font-normal">Date</th>
                <th className="w-[34%] px-3 py-2.5 font-normal">
                  <div className="flex justify-between">
                    <span>Early-bird</span>
                    <span>now → 14d</span>
                  </div>
                </th>
                <th className="px-4 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {tab?.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-mono text-xs text-[#999]">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {tab?.rows.map((s) => (
                <tr key={s.id} className="group transition-colors hover:bg-white/[0.03]">
                  <td className="max-w-[260px] px-4 py-3">
                    <Link href={`/shows/${s.id}`} className="flex min-w-0 items-center gap-3">
                      <ArtistTile name={s.artist} size="sm" mustSee={s.priority === "Must-see"} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white group-hover:underline">{s.artist}</span>
                        <span className="block truncate text-xs text-[#999]">{s.eventName}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#ededed]">{s.city}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap text-[#ededed]">{fmt.format(new Date(s.startsAt))}</td>
                  <td className="px-3 py-3">
                    <TimelineBar from={s.ebOpensAt} to={s.ebClosesAt} now={now} active={s.ebState === "open"} />
                    <span className={cn("mt-1.5 block font-mono text-[11px]", s.ebState === "open" ? "text-[#52a8ff]" : "text-[#999]")}>{ebLabel(s, now)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.karanStatus ? <StatusBadge status={s.karanStatus} tier={s.bookedTier} /> : s.priority === "Must-see" ? <Chip tone="blue">Must-see</Chip> : <Chip>New</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
