import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RawJsonDrawer } from "@/components/radar/raw-json";
import { PageHeader } from "@/components/radar/section";
import { SyncNow } from "@/components/radar/sync-now";
import { getLiveFeed, getStatus } from "@/lib/server/views";
import { formatIst, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

const KINDS = [
  { v: "all", l: "All calls" },
  { v: "serpapi", l: "Google Events" },
  { v: "gemini_web", l: "Gemini web" },
  { v: "gemini", l: "Gemini" },
  { v: "scan", l: "Scans" },
  { v: "reset", l: "Resets" },
];
const KIND_STYLE: Record<string, string> = {
  serpapi: "text-src-serpapi",
  gemini_web: "text-src-gemini",
  gemini: "text-src-gemini",
  scan: "text-white/70",
  reset: "text-src-demo",
};

export default function LiveFeedPage({ searchParams }: PageProps<"/live-feed">) {
  return (
    <>
      <PageHeader eyebrow="Behind the scenes" title="How the radar" italic="stays fresh." note="Every Google Events search (via SearchApi/SerpApi) and Gemini Flash call the radar makes, with what came back. Open any listing's raw JSON next to the show it became." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-xl bg-white/5" />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Feed({ searchParams }: { searchParams: PageProps<"/live-feed">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && KINDS.some((k) => k.v === sp.kind) ? sp.kind : "all";
  const now = new Date();
  const [status, feed] = await Promise.all([getStatus(), getLiveFeed()]);
  const pct = Math.min(100, Math.round((status.quotaUsed / Math.max(1, status.quotaLimit)) * 100));
  const nextManual = status.lastManualSyncAt ? new Date(new Date(status.lastManualSyncAt).getTime() + 3600_000) : null;
  const logs = feed.logs.filter((l) => kind === "all" || l.kind === kind);
  const showById = new Map(feed.matchedShows.map((s) => [s.id, s]));
  const serpCalls = feed.logs.filter((l) => l.kind === "serpapi" && l.searchesUsed > 0).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 pb-24 md:px-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl tech-card p-6 md:p-8">
          <p className="text-xs font-semibold tracking-wider text-white/40 uppercase">Google Events searches used</p>
          <p className="mt-3  text-6xl tracking-tight">
            {status.quotaUsed}
            <span className="text-2xl text-white/40"> / {status.quotaLimit} searches</span>
          </p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full rounded-full", pct > 85 ? "bg-[#ededed]" : "bg-[#52a8ff]")} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-sm text-white/50">Plan: Bengaluru, Mumbai and Chennai once a day, plus a monthly sweep per Must-see artist. The guard never lets a run pass the quota.</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            {[
              ["Last SerpApi sync", status.lastSerpSyncAt],
              ["Last web scan", status.lastWebScanAt],
              ["Last alert scan", status.lastScanAt],
              ["Last daily reset", status.lastResetAt],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-white/40">{k}</dt>
                <dd className="mt-0.5 text-white/90">{v ? timeAgo(new Date(v), now) : "never"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col justify-between gap-6 rounded-xl bg-hype p-6 text-white md:p-8">
          <div>
            <p className="text-sm font-medium tracking-wide uppercase">Watch a fetch happen</p>
            <p className="mt-3  text-3xl leading-tight">Press Sync now and a real Google Events search lands in the table below.</p>
            <p className="mt-2 text-sm text-white/85">One search, globally limited to once an hour. Total Google Events calls logged: {serpCalls}.</p>
          </div>
          <div className="[&_button]:bg-black [&_button]:text-white [&_button:disabled]:bg-black/30 [&_p]:text-white/85">
            <SyncNow initialNextAt={nextManual && nextManual > now ? nextManual.toISOString() : null} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl">Call log</h2>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Link key={k.v} href={k.v === "all" ? "/live-feed" : `/live-feed?kind=${k.v}`} scroll={false} className={cn("rounded-lg px-3 py-1 font-mono text-sm", kind === k.v ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)]")}>
                {k.l}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs tracking-wide text-white/45 uppercase">
              <tr>
                {["Time (IST)", "Kind", "Query / description", "City", "Page", "Results", "Matched", "New shows", "Alerts", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-white/45">
                    No calls logged yet.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-white/60">{formatIst(new Date(l.startedAt), "d MMM HH:mm:ss")}</td>
                  <td className={cn("px-4 py-2.5 font-medium whitespace-nowrap", KIND_STYLE[l.kind])}>{l.kind}</td>
                  <td className="max-w-[320px] truncate px-4 py-2.5 text-white/85" title={l.description ?? ""}>
                    {l.queryId && <span className="mr-1.5 font-mono text-xs text-white/40">{l.queryId}</span>}
                    {l.description}
                  </td>
                  <td className="px-4 py-2.5 text-white/70">{l.city ?? "—"}</td>
                  <td className="px-4 py-2.5 text-white/70">{l.page ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{l.resultsCount}</td>
                  <td className="px-4 py-2.5 tabular-nums">{l.matchedCount}</td>
                  <td className="px-4 py-2.5 tabular-nums">{l.newShowsCount}</td>
                  <td className="px-4 py-2.5 tabular-nums">{l.alertsCreated}</td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-xs" title={l.error ?? ""}>
                    {l.error ? <span className="text-red-300">{l.error}</span> : l.finishedAt ? <span className="text-emerald-300/80">ok</span> : <span className="text-white/40">running…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-4xl">Raw Google Events listings</h2>
        <p className="mt-2 mb-5 text-white/55">Every events_results item is stored as-is. Open one to see its JSON next to the show it was matched to.</p>
        {feed.raw.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-8 text-white/50">No SerpApi results stored yet. Press Sync now, or wait for the 09:00 IST daily sync.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {feed.raw.map((r) => {
              const s = r.showId ? showById.get(r.showId) : undefined;
              return (
                <div key={r.id} className="flex flex-col gap-2 rounded-2xl tech-card p-3 md:flex-row md:items-center md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-white/45">
                      {r.query} · p{r.page} · {r.parsedCity ?? "?"} · {r.parsedStartsAt ? formatIst(new Date(r.parsedStartsAt), "d MMM yyyy") : "no date"} · fetched {timeAgo(new Date(r.fetchedAt), now)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "v-chip w-fit shrink-0",
                      r.matchMethod !== "none" ? "text-[#62c073]" : "text-[#999]",
                    )}
                  >
                    {r.matchMethod === "none" ? (r.skipReason ?? "unmatched") : `${r.matchMethod} → ${s?.artist ?? "show"}`}
                  </span>
                  <RawJsonDrawer
                    row={{
                      id: r.id,
                      title: r.title,
                      query: r.query,
                      page: r.page,
                      fetchedAt: r.fetchedAt,
                      rawJson: r.rawJson,
                      parsedCity: r.parsedCity,
                      parsedStartsAt: r.parsedStartsAt,
                      matchMethod: r.matchMethod,
                      matchConfidence: r.matchConfidence,
                      skipReason: r.skipReason,
                      show: s ? { id: s.id, artist: s.artist, eventName: s.eventName, city: s.city, when: formatIst(new Date(s.startsAt), "EEE d MMM yyyy") } : null,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-3xl">Unmatched events</h2>
          <p className="mt-2 mb-4 text-sm text-white/55">In India, in range, but not by any of Karan&apos;s 60 artists (alias match failed and Gemini was below 0.8 confidence).</p>
          <ul className="flex flex-col gap-1.5">
            {feed.unmatched.length === 0 && <li className="text-sm text-white/40">None yet.</li>}
            {feed.unmatched.map((u) => (
              <li key={u.id} className="flex justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
                <span className="truncate">{u.title}</span>
                <span className="shrink-0 text-xs text-white/40">
                  {u.city ?? "?"} · {u.startsAt ? formatIst(new Date(u.startsAt), "d MMM") : "?"}
                  {u.confidence !== null ? ` · ${Math.round(u.confidence * 100)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-3xl">Rumours</h2>
          <p className="mt-2 mb-4 text-sm text-white/55">Gemini web finds without a usable source URL or date. Shown, never alerted.</p>
          <ul className="flex flex-col gap-1.5">
            {feed.rumours.length === 0 && <li className="text-sm text-white/40">No rumours. Gemini only reported sourced finds so far.</li>}
            {feed.rumours.map((r) => (
              <li key={r.id} className="rounded-xl border border-dashed border-src-gemini/25 px-3 py-2 text-sm">
                <p>{r.claim}</p>
                <p className="text-xs text-white/40">
                  {r.dateText ?? "no date"} · not trusted: {r.reason} · {timeAgo(new Date(r.createdAt), now)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
