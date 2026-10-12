import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArtistTile } from "@/components/radar/artist-tile";
import { PriorityBadge, SimulatedBadge, SourceBadge, StatusBadge, UrgencyPill, VerdictChip } from "@/components/radar/badges";
import { EarlyBirdLine, WhereToBuy } from "@/components/radar/show-card";
import { StatusButtons } from "@/components/radar/status-buttons";
import { getShowView } from "@/lib/server/views";
import { formatIst, timeAgo } from "@/lib/time";

export default function ShowPage({ params }: PageProps<"/shows/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[70vh] max-w-5xl animate-pulse px-4 pt-36" />}>
      <ShowDetail params={params} />
    </Suspense>
  );
}

const inr = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN")}`);

async function ShowDetail({ params }: { params: PageProps<"/shows/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const data = await getShowView(n);
  if (!data) notFound();
  const { view: s, alerts } = data;
  const now = new Date();
  const facts: [string, React.ReactNode][] = [
    ["Artist", s.artist],
    ["Event", `${s.eventName}${s.eventType === "Festival" ? " (festival)" : ""}`],
    ["Venue", s.venue ?? "Venue TBA"],
    ["City", s.city],
    ["Date", s.dateText],
    ["Early-bird", <EarlyBirdLine key="eb" show={s} />],
    ["Early-bird price", `${inr(s.ebPriceInr)}${s.ebSource === "simulated" && s.ebPriceInr !== null ? " (simulated)" : ""}`],
    ["General price", inr(s.generalPriceInr)],
    ["General tickets", s.generalStatus ?? "—"],
    ["Where to buy", <WhereToBuy key="buy" show={s} />],
    ["Alerting", s.alertable ? "Yes: matches Karan's city rule" : "Visible only (city rule)"],
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 pt-32 pb-24 md:px-6">
      <Link href="/shows" className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="size-4" /> All shows
      </Link>
      <header className="mt-6 flex flex-col gap-6 md:flex-row md:items-center">
        <ArtistTile name={s.artist} size="lg" />
        <div>
          <div className="flex flex-wrap gap-1.5">
            <PriorityBadge priority={s.priority} />
            <SourceBadge show={s} />
            {s.ebSource === "simulated" && <SimulatedBadge />}
            <StatusBadge status={s.karanStatus} tier={s.bookedTier} />
          </div>
          <h1 className="mt-3  text-5xl leading-none tracking-tight md:text-6xl">{s.artist}</h1>
          <p className="mt-2 text-lg text-white/60">{s.eventName}</p>
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl tech-card p-6">
          <h2 className="text-xs font-semibold tracking-wider text-white/40 uppercase">Facts · from the database</h2>
          <dl className="mt-4 divide-y divide-white/5">
            {facts.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-sm">
                <dt className="text-white/45">{k}</dt>
                <dd className="min-w-0 text-white/90">{v}</dd>
              </div>
            ))}
          </dl>
          {s.sourceUrl && (
            <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex max-w-full items-center gap-1.5 text-sm break-all text-white/60 hover:text-white">
              <ExternalLink className="size-3.5 shrink-0" /> Source: {s.sourceUrl.replace(/^https?:\/\//, "").slice(0, 70)}
            </a>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl tech-card p-6">
            <h2 className="text-xs font-semibold tracking-wider text-white/40 uppercase">Your call</h2>
            <div className="mt-4">
              {s.past ? <p className="text-white/60">This show has passed{s.missed ? " — logged as missed." : "."}</p> : <StatusButtons showId={s.id} status={s.karanStatus} tier={s.bookedTier} ebAvailable={s.ebState === "open" || s.ebState === "upcoming"} past={s.past} />}
            </div>
          </section>
          {s.verdict && (
            <section className="rounded-xl tech-card p-6">
              <h2 className="text-xs font-semibold tracking-wider text-white/40 uppercase">Worth the trip?</h2>
              <div className="mt-3">
                <VerdictChip verdict={s.verdict} reason={s.verdictReason} by={s.verdictBy} />
              </div>
              <p className="mt-3 text-white/75">{s.verdictReason}</p>
              <p className="mt-2 text-xs text-white/35">{s.verdictBy === "gemini" ? "Verdict by Gemini Flash" : "Verdict by the rules fallback"}</p>
            </section>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-3xl">Alert history</h2>
        {alerts.length === 0 ? (
          <p className="mt-4 text-white/50">{s.alertable ? "No alerts yet." : "This show is visible only, so it never alerts."}</p>
        ) : (
          <ol className="mt-5 flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-2xl tech-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                  <UrgencyPill urgency={a.urgency} />
                  <span className="font-mono">{a.type}</span>
                  <span>· {formatIst(new Date(a.createdAt), "d MMM, h:mm a")} IST ({timeAgo(new Date(a.createdAt), now)})</span>
                  {a.emailedAt && (
                    <span className="inline-flex items-center gap-1 text-emerald-300/80">
                      <Mail className="size-3" /> {a.isHistorical ? "seeded history" : a.emailError?.startsWith("dry run") ? "logged (dry run)" : "emailed"}
                    </span>
                  )}
                  {a.emailError && !a.emailError.startsWith("dry run") && <span className="text-red-300">email failed: {a.emailError}</span>}
                </div>
                <p className="mt-2 font-medium">{a.headline}</p>
                <p className="text-sm text-white/60">{a.body}</p>
                {a.artists.length > 1 && <p className="mt-1 text-xs text-white/40">Lineup: {a.artists.join(", ")}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
