import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ShowView } from "@/lib/server/views";
import { cn } from "@/lib/utils";
import { ArtistTile } from "./artist-tile";
import { Chip, PriorityBadge, SimulatedBadge, StatusBadge, VerdictChip } from "./badges";
import { Countdown } from "./countdown";
import { StatusButtons } from "./status-buttons";

/** Early-bird state as a chip + live countdown — the thing that decides whether Karan acts today. */
export function EarlyBirdLine({ show }: { show: ShowView }) {
  if (show.ebState === "open" && show.ebClosesAt) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="blue">EB open</Chip>
        <span className={cn("font-mono text-xs", show.ebUrgent ? "text-[#52a8ff]" : "text-[#999]")}>
          closes in <Countdown to={show.ebClosesAt} done="now" compact />
        </span>
      </div>
    );
  }
  if (show.ebState === "upcoming" && show.ebOpensAt) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="light">EB soon</Chip>
        <span className="font-mono text-xs text-[#999]">
          opens in <Countdown to={show.ebOpensAt} done="now" compact />
        </span>
      </div>
    );
  }
  const label = show.ebState === "sold_out" ? "EB sold out" : show.ebState === "closed" ? "EB closed" : "EB not announced";
  return <Chip tone="warn">{label}</Chip>;
}

export function WhereToBuy({ show }: { show: ShowView }) {
  const label = show.ticket.via === "fallback" ? "Check BookMyShow" : `Tickets · ${show.ticket.platform}`;
  return show.ticket.url ? (
    <a href={show.ticket.url} target="_blank" rel="noreferrer noopener" title={show.ticket.label} className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-[#ededed] underline-offset-4 hover:underline">
      <span className="truncate">{label}</span>
      <ArrowUpRight className="size-3.5 shrink-0" />
    </a>
  ) : (
    <span title={show.ticket.label} className="truncate font-mono text-xs text-[#999]">
      {label}
    </span>
  );
}

export function ShowCard({ show, critical = false }: { show: ShowView; critical?: boolean; compact?: boolean }) {
  return (
    <article className={cn("tech-card flex h-full flex-col gap-4 rounded-xl p-5 transition-shadow", critical && "glow-critical", show.karanStatus === "skipped" && "opacity-55")}>
      <div className="flex items-start gap-3">
        <ArtistTile name={show.artist} mustSee={show.priority === "Must-see"} />
        <div className="min-w-0 flex-1">
          <Link href={`/shows/${show.id}`} className="block focus-visible:outline-2 focus-visible:outline-[#52a8ff]">
            <h3 className="truncate text-lg leading-tight">{show.artist}</h3>
            <p className="mt-0.5 truncate text-sm text-[#999]">{show.eventName}</p>
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-[52px_1fr] gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="text-[#666]">DATE</dt>
        <dd className="text-[#ededed]">{show.dateText}</dd>
        <dt className="text-[#666]">VENUE</dt>
        <dd className="text-[#ededed]">
          {show.venue ?? "TBA"}, {show.city}
        </dd>
      </dl>

      <EarlyBirdLine show={show} />

      <div className="flex flex-wrap gap-1.5">
        <PriorityBadge priority={show.priority} />
        <StatusBadge status={show.karanStatus} tier={show.bookedTier} />
        {show.eventType === "Festival" && <Chip tone="light">Festival</Chip>}
        {show.ebSource === "simulated" && <SimulatedBadge />}
        {show.verdict && show.priority === "Must-see" && (show.city === "Mumbai" || show.city === "Chennai") && <VerdictChip verdict={show.verdict} reason={show.verdictReason} by={show.verdictBy} />}
      </div>
      {show.verdictReason && show.priority === "Must-see" && (show.city === "Mumbai" || show.city === "Chennai") && <p className="text-xs leading-relaxed text-[#999]">{show.verdictReason}</p>}

      <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4">
        <WhereToBuy show={show} />
        <StatusButtons showId={show.id} status={show.karanStatus} tier={show.bookedTier} ebAvailable={show.ebState === "open" || show.ebState === "upcoming"} past={show.past} />
      </div>
    </article>
  );
}
