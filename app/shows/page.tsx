import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/radar/section";
import { ShowCard } from "@/components/radar/show-card";
import { EmptyState } from "@/components/radar/states";
import { getShowViews } from "@/lib/server/views";
import { cn } from "@/lib/utils";

const CITIES = ["All", "Bengaluru", "Mumbai", "Chennai"] as const;
const TYPES = [
  { v: "all", l: "All" },
  { v: "concert", l: "Concerts" },
  { v: "festival", l: "Festivals" },
] as const;
const MODES = [
  { v: "all", l: "All" },
  { v: "alerting", l: "I get alerts" },
  { v: "visible", l: "Just for info" },
] as const;

export default function ShowsPage({ searchParams }: PageProps<"/shows">) {
  return (
    <>
      <PageHeader eyebrow="Bengaluru · Mumbai · Chennai" title="All the" italic="shows." note="Every upcoming show by your artists. You get alerts for every Bengaluru show, and for Must-see artists in Mumbai and Chennai." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-xl bg-white/5" />}>
        <ShowsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", active ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:text-white")}>
      {children}
    </Link>
  );
}

async function ShowsList({ searchParams }: { searchParams: PageProps<"/shows">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const city = CITIES.find((c) => c === one("city")) ?? "All";
  const type = one("type") ?? "all";
  const mode = one("mode") ?? "all";
  const past = one("past") === "1";
  const all = await getShowViews();
  const list = all.filter(
    (s) =>
      (past || !s.past) &&
      (city === "All" || s.city === city) &&
      (type === "all" || (type === "festival" ? s.eventType === "Festival" : s.eventType === "Concert")) &&
      (mode === "all" || (mode === "alerting" ? s.alertable : !s.alertable)),
  );
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ city, type, mode, ...(past ? { past: "1" } : {}), ...patch });
    for (const [k, v] of [...q.entries()]) if (v === "all" || v === "All") q.delete(k);
    return `/shows${q.size ? `?${q}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
      <div className="sticky top-16 z-30 -mx-4 mb-8 flex flex-col gap-3 border-y border-white/5 bg-black/85 px-4 py-4 backdrop-blur-md md:mx-0 md:rounded-xl md:border">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-white/40 uppercase">City</span>
          {CITIES.map((c) => (
            <Chip key={c} href={href({ city: c })} active={city === c}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-white/40 uppercase">Type</span>
          {TYPES.map((t) => (
            <Chip key={t.v} href={href({ type: t.v })} active={type === t.v}>
              {t.l}
            </Chip>
          ))}
          <span className="ml-0 w-16 text-xs text-white/40 uppercase md:ml-4">Alerts</span>
          {MODES.map((m) => (
            <Chip key={m.v} href={href({ mode: m.v })} active={mode === m.v}>
              {m.l}
            </Chip>
          ))}
          <Chip href={href({ past: past ? "" : "1" })} active={past}>
            Include past
          </Chip>
        </div>
      </div>
      <p className="mb-5 text-sm text-white/45">{list.length} shows</p>
      {list.length === 0 ? (
        <EmptyState title="Nothing matches these filters" note="Try another city or include past shows." />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <ShowCard key={s.id} show={s} critical={s.alertable && s.ebUrgent && s.ebState === "open" && !s.karanStatus} compact />
          ))}
        </div>
      )}
    </div>
  );
}
