import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/radar/section";
import { getShowViews, type ShowView } from "@/lib/server/views";
import { addIstDays, formatIst, istDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const SOURCE: Record<ShowView["source"], { label: string; dot: string; bar: string }> = {
  serpapi: { label: "Google Events", dot: "bg-src-serpapi", bar: "border-l-src-serpapi" },
  gemini_web: { label: "Web find", dot: "bg-src-gemini", bar: "border-l-src-gemini" },
  known: { label: "Confirmed", dot: "bg-src-known", bar: "border-l-src-known" },
  demo: { label: "", dot: "bg-src-demo", bar: "border-l-src-demo" },
};
const CITIES = ["All", "Bengaluru", "Mumbai", "Chennai"];

export default function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  return (
    <>
      <PageHeader eyebrow="Next six months" title="Your concert" italic="calendar." note="Every show on the radar, month by month." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-xl bg-white/5" />}>
        <TimelineBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TimelineBody({ searchParams }: { searchParams: PageProps<"/timeline">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const city = typeof sp.city === "string" && CITIES.includes(sp.city) ? sp.city : "All";
  const prio = sp.priority === "Must-see" || sp.priority === "Like" ? sp.priority : "All";
  const now = new Date();
  const today = istDate(now);
  const end = addIstDays(today, 183);
  const views = (await getShowViews(now)).filter((s) => {
    const d = istDate(new Date(s.startsAt));
    return d >= today && d <= end && (city === "All" || s.city === city) && (prio === "All" || s.priority === prio);
  });
  const months = new Map<string, ShowView[]>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    months.set(d.toISOString().slice(0, 7), []);
  }
  for (const v of views) {
    const k = istDate(new Date(v.startsAt)).slice(0, 7);
    months.get(k)?.push(v);
  }
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ city, priority: prio, ...p });
    for (const [k, v] of [...q.entries()]) if (v === "All") q.delete(k);
    return `/timeline${q.size ? `?${q}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <Link key={c} href={href({ city: c })} scroll={false} className={cn("rounded-lg px-3 py-1 font-mono text-sm", city === c ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:text-white")}>
              {c}
            </Link>
          ))}
          <span className="mx-1 hidden h-7 w-px bg-white/10 md:block" />
          {["All", "Must-see", "Like"].map((p) => (
            <Link key={p} href={href({ priority: p })} scroll={false} className={cn("rounded-lg px-3 py-1 font-mono text-sm", prio === p ? "bg-[#ff8f8f] text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)]")}>
              {p}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-white/60">
          {Object.values(SOURCE).filter((s) => s.label).map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", s.dot)} /> {s.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#52a8ff]">★</span> Must-see artist
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#62c073]">✓</span> You&apos;re going
          </span>
        </div>
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
        {[...months.entries()].map(([month, list]) => (
          <section key={month} className="w-[82vw] shrink-0 snap-start rounded-xl tech-card/60 p-4 sm:w-[300px]">
            <header className="mb-4 flex items-baseline justify-between">
              <h2 className="text-3xl">{formatIst(new Date(`${month}-15T12:00:00Z`), "MMM")}</h2>
              <span className="text-xs text-white/40">
                {formatIst(new Date(`${month}-15T12:00:00Z`), "yyyy")} · {list.length}
              </span>
            </header>
            <ol className="flex flex-col gap-2">
              {list.length === 0 && <li className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/35">Nothing yet</li>}
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={`/shows/${s.id}`} className={cn("block rounded-xl border border-l-4 border-white/5 bg-black/30 px-3 py-2 transition-colors hover:bg-white/5", SOURCE[s.source].bar)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{s.artist}</span>
                      <span className="shrink-0 font-mono text-[11px] text-white/45">{formatIst(new Date(s.startsAt), "d MMM")}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/45">
                      <span className="truncate">
                        {s.city}
                        {s.eventType === "Festival" ? " · fest" : ""}
                      </span>
                      <span className="shrink-0">
                        {s.karanStatus === "going" ? <span className="text-[#62c073]">✓ going </span> : s.karanStatus === "interested" ? "interested " : ""}
                        {s.priority === "Must-see" && <span className="text-[#52a8ff]">★</span>}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
