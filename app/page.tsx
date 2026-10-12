import { ArrowUpRight } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatchupScan } from "@/components/radar/catchup-scan";
import { ConfettiField, Crowd, Equalizer, Ticker } from "@/components/radar/concert-fx";
import { Dancer } from "@/components/radar/dancer";
import { EventStream } from "@/components/radar/event-stream";
import { Reveal } from "@/components/radar/reveal";
import { SectionHeader } from "@/components/radar/section";
import { ShowCard } from "@/components/radar/show-card";
import { EmptyState, ErrorPanel } from "@/components/radar/states";
import { getShowViews, getStatus, type ShowView } from "@/lib/server/views";
import { timeAgo } from "@/lib/time";

export default function RadarPage() {
  return (
    <>
      <CatchupScan />
      <Suspense fallback={<RadarSkeleton />}>
        <Radar />
      </Suspense>
    </>
  );
}

async function Radar() {
  await connection();
  const now = new Date();
  let views: ShowView[];
  let status: Awaited<ReturnType<typeof getStatus>>;
  try {
    [views, status] = await Promise.all([getShowViews(now), getStatus()]);
  } catch (e) {
    return <ErrorPanel message={e instanceof Error ? e.message : String(e)} />;
  }
  const upcoming = views.filter((v) => !v.past && v.karanStatus !== "skipped");
  const mine = upcoming.filter((v) => v.alertable);

  // Grab it now: early-birds open and closing soon (or opening within 48h), not yet booked.
  const grab = mine
    .filter(
      (v) =>
        v.karanStatus !== "going" &&
        ((v.ebState === "open" && v.ebUrgent) || (v.ebState === "upcoming" && v.ebOpensAt && new Date(v.ebOpensAt).getTime() - now.getTime() < 48 * 3600_000)),
    )
    .sort((a, b) => (a.ebClosesAt ?? a.ebOpensAt ?? "").localeCompare(b.ebClosesAt ?? b.ebOpensAt ?? ""));
  const fresh = mine.filter((v) => now.getTime() - new Date(v.announcedAt).getTime() < 7 * 86_400_000).sort((a, b) => b.announcedAt.localeCompare(a.announcedAt));
  const going = upcoming.filter((v) => v.karanStatus === "going");
  // Realistic count: how many of the 60 followed artists actually have upcoming dates (not how many shows).
  const artistsPlaying = new Set(upcoming.map((v) => v.artistId)).size;
  const inCity = (c: string) => upcoming.filter((v) => v.city === c && (c === "Bengaluru" || v.priority === "Must-see" || v.karanStatus));

  const metrics = [
    { v: grab.length, unit: "EB", label: "Early-birds closing or opening within 48h" },
    { v: fresh.length, unit: "NEW", label: "Shows announced in the last 7 days" },
    { v: going.length, unit: "GOING", label: "Shows you've booked" },
    { v: artistsPlaying, unit: "/ 60", label: "Of your artists have shows coming up" },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[82svh] items-end overflow-hidden pt-32 pb-36 md:pb-44">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-1/3 left-1/2 h-[120%] w-[140%] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(82,168,255,0.2),rgba(82,168,255,0.04)_55%,transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_50%_30%,black_20%,transparent_70%)] bg-[size:56px_56px]" />
          <div className="scrim absolute inset-x-0 bottom-0 h-[40%]" />
          <ConfettiField />
          <Crowd />
        </div>
        <div className="relative mx-auto grid w-full max-w-6xl items-end gap-6 px-4 md:grid-cols-[1fr_300px] md:px-6">
          <Dancer className="order-first mx-auto h-[220px] w-[170px] md:order-last md:h-[380px] md:w-[300px]" />
          <Reveal>
            <p className="text-coral flex items-center gap-2.5 font-mono text-xs tracking-wider uppercase">
              <Equalizer />
              Hey Karan · checked {status.lastScanAt ? timeAgo(new Date(status.lastScanAt), now) : "just now"} · BLR · MUM · CHE
            </p>
            <h1 className="mt-4 max-w-[752px] text-[clamp(2rem,6vw,3.75rem)] leading-[1.02] tracking-[-0.056em]">
              Every show by your 60 artists, <span className="text-gold glow-gold">the moment it drops.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-[#e7e7e7]">
              {grab.length > 0
                ? `${grab.length} early-bird${grab.length === 1 ? " ticket opens or closes" : " tickets open or close"} in the next 48 hours. Book now and pay less.`
                : "Nothing urgent right now. New shows and closing early-birds land here and in your inbox."}
            </p>
            <a href={grab.length ? "#grab" : "#stream"} className="btn-square mt-8 px-5 py-3 text-[20px]">
              {grab.length ? "Grab what's closing" : "See what's coming"}
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
            </a>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-20 px-4 pb-16 md:px-6">
        <div className="-mx-4 md:-mx-6">
          <Ticker />
        </div>

        {/* Metrics grid */}
        <section className="grid grid-cols-2 overflow-hidden rounded-xl md:grid-cols-4" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.145)" }}>
          {metrics.map((m, i) => (
            <div key={m.unit} className={`bg-[#0a0a0a] p-5 md:p-6 ${i % 2 === 0 ? "border-r" : "md:border-r"} ${i < 2 ? "border-b md:border-b-0" : ""} border-white/[0.145] last:border-r-0`}>
              <p className="flex items-baseline gap-2">
                <span className={`text-[44px] leading-none font-medium tracking-[-3.36px] md:text-[56px] ${i % 2 ? "text-coral" : "text-gold"}`} style={{ fontFamily: "var(--font-geist-sans), var(--font-inter)" }}>
                  {m.v}
                </span>
                <span className="font-mono text-xs text-[#999]">{m.unit}</span>
              </p>
              <p className="mt-3 text-sm text-[#999]">{m.label}</p>
            </div>
          ))}
        </section>

        {/* Bento: act now */}
        <section id="grab" className="scroll-mt-24">
          <SectionHeader tone="coral" eyebrow="Act now" title="Grab it now 🎟️" note="Early-birds that close or open within 48 hours. Each one is also in your inbox." count={grab.length} />
          {grab.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {grab.map((s) => (
                <ShowCard key={s.id} show={s} critical={s.ebState === "open"} />
              ))}
            </div>
          ) : (
            <EmptyState title="No early-bird is about to close" note="The radar checks every 5 minutes." />
          )}
        </section>

        {/* Event stream */}
        <section id="stream" className="scroll-mt-24">
          <SectionHeader tone="gold" eyebrow="Event stream" title="Everything on your radar 🎶" note="New announcements, and upcoming shows by city. Tap a row for the full details." />
          <EventStream
            tabs={[
              { id: "New", label: "Just announced", dot: "#52a8ff", rows: fresh },
              { id: "Bengaluru", label: "Bengaluru", dot: "#ededed", rows: inCity("Bengaluru") },
              { id: "Mumbai", label: "Mumbai", dot: "#ededed", rows: inCity("Mumbai") },
              { id: "Chennai", label: "Chennai", dot: "#ededed", rows: inCity("Chennai") },
              { id: "Going", label: "You're going", dot: "#62c073", rows: going },
            ]}
          />
        </section>
      </div>
    </>
  );
}

function RadarSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-40 md:px-6">
      <div className="h-16 w-2/3 animate-pulse rounded-md bg-white/5" />
      <div className="mt-6 h-6 w-1/3 animate-pulse rounded-md bg-white/5" />
      <div className="mt-24 h-32 animate-pulse rounded-xl bg-white/5" />
    </div>
  );
}
