import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArtistTile } from "@/components/radar/artist-tile";
import { PageHeader } from "@/components/radar/section";
import { fomoStats } from "@/lib/logic/rules";
import { getShowViews, type ShowView } from "@/lib/server/views";

export default function PlansPage() {
  return (
    <>
      <PageHeader eyebrow="Karan's calendar" title="My Plans" italic="& the FOMO Meter." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-xl bg-white/5" />}>
        <Plans />
      </Suspense>
    </>
  );
}

function Row({ s }: { s: ShowView }) {
  return (
    <Link href={`/shows/${s.id}`} className="flex items-center gap-3 rounded-2xl tech-card p-3 transition-colors hover:border-white/30">
      <ArtistTile name={s.artist} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.artist}</p>
        <p className="truncate text-xs text-white/50">
          {s.city} · {s.dateText}
        </p>
      </div>
      {s.karanStatus === "going" && <span className="shrink-0 text-xs text-emerald-300">{s.bookedTier === "early_bird" ? "early-bird" : "general"}</span>}
    </Link>
  );
}

async function Plans() {
  await connection();
  const views = await getShowViews();
  const going = views.filter((v) => v.karanStatus === "going");
  const interested = views.filter((v) => v.karanStatus === "interested" && !v.past);
  const missed = views.filter((v) => v.missed);
  const f = fomoStats(
    views
      .filter((v) => v.karanStatus || v.missed)
      .map((v) => ({
        karanStatus: v.karanStatus,
        bookedTier: v.bookedTier,
        ebPriceInr: v.ebPriceInr,
        generalPriceInr: v.generalPriceInr,
        announcedAt: new Date(v.announcedAt),
        statusChangedAt: v.statusChangedAt ? new Date(v.statusChangedAt) : null,
        missed: v.missed,
      })),
  );
  const stats = [
    { k: "Shows caught", v: String(f.caught), note: `${going.filter((g) => g.past).length} already lived` },
    { k: "Shows missed", v: String(f.missed), note: "passed or sold out, no action" },
    { k: "Early-birds grabbed", v: String(f.earlyBirds), note: "booked in the cheap tier" },
    { k: "Money saved", v: `₹${f.moneySavedInr.toLocaleString("en-IN")}`, note: "general − early-bird on early-bird bookings" },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_2fr]">
        <div className="relative overflow-hidden rounded-xl bg-hype p-8 text-white">
          <div aria-hidden className="absolute -right-16 -bottom-16 size-56 rounded-full border-[24px] border-white/15" />
          <p className="text-sm font-medium tracking-wide uppercase">FOMO Meter</p>
          <p className="mt-4  text-8xl leading-none tracking-tight">{f.score}%</p>
          <p className="mt-3 max-w-xs text-white/85">of the shows Karan had to decide on, he actually caught.</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${f.score}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {stats.map((s) => (
            <div key={s.k} className="rounded-xl tech-card p-5">
              <p className="text-xs tracking-wide text-white/45 uppercase">{s.k}</p>
              <p className="mt-2  text-4xl">{s.v}</p>
              <p className="mt-1 text-xs text-white/40">{s.note}</p>
            </div>
          ))}
          <div className="rounded-xl tech-card p-5">
            <p className="text-xs tracking-wide text-white/45 uppercase">Avg. time to act</p>
            <p className="mt-2  text-4xl">{f.avgHoursToAction === null ? "—" : `${f.avgHoursToAction}h`}</p>
            <p className="mt-1 text-xs text-white/40">from announcement to Going / Remind me / Skip</p>
          </div>
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {[
          { title: "Going", list: going, empty: "Nothing booked yet." },
          { title: "Reminders on", list: interested, empty: "No reminders set." },
          { title: "Missed", list: missed, empty: "Nothing missed. Radar doing its job." },
        ].map((col) => (
          <section key={col.title}>
            <h2 className="mb-4  text-3xl">
              {col.title} <span className="font-sans text-base text-white/40">{col.list.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {col.list.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/45">{col.empty}</p> : col.list.map((s) => <Row key={s.id} s={s} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
