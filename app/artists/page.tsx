import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArtistTile } from "@/components/radar/artist-tile";
import { PriorityToggle } from "@/components/radar/priority-toggle";
import { PageHeader, SectionHeader } from "@/components/radar/section";
import { getArtistsWithShows } from "@/lib/server/views";

export default function ArtistsPage() {
  return (
    <>
      <PageHeader eyebrow="Who the radar follows" title="60 artists," italic="all monitored." note="Must-see artists alert in Bengaluru, Mumbai and Chennai (with a Worth-the-trip verdict). Like artists alert in Bengaluru. Flip a toggle and the city rule follows on the next scan." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-xl bg-white/5" />}>
        <ArtistGrid />
      </Suspense>
    </>
  );
}

type ArtistRow = Awaited<ReturnType<typeof getArtistsWithShows>>[number];

function ArtistCard({ a }: { a: ArtistRow }) {
  const waiting = a.showCount === 0;
  return (
    <article className="tech-card flex flex-col gap-4 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <ArtistTile name={a.name} size="sm" mustSee={a.priority === "Must-see"} />
        <div className="min-w-0">
          <h3 className="truncate text-lg leading-tight">{a.name}</h3>
          <p className="truncate font-mono text-xs text-[#999]">
            {a.genre} · {a.country}
          </p>
        </div>
      </div>
      <PriorityToggle artistId={a.id} priority={a.priority} />
      <div className="mt-auto font-mono text-xs">
        {waiting ? (
          <div className="flex flex-col gap-2">
            <span className="v-chip w-fit">
              <span className="v-dot animate-pulse" style={{ background: "#52a8ff" }} />
              Waiting for dates
            </span>
            <p className="font-sans text-sm text-[#999]">No shows in Bengaluru, Mumbai or Chennai yet. The radar checks every day and emails you the moment one is announced.</p>
          </div>
        ) : (
          <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1">
            <dt className="text-[#666]">CITIES</dt>
            <dd className="text-[#ededed]">{a.cities.join(", ")}</dd>
            <dt className="text-[#666]">NEXT</dt>
            <dd>
              {a.nextShow && (
                <Link href={`/shows/${a.nextShow.id}`} className="text-[#ededed] underline-offset-4 hover:underline">
                  {a.nextShow.dateText}
                </Link>
              )}
            </dd>
            <dt className="text-[#666]">SHOWS</dt>
            <dd className="text-[#ededed]">{a.showCount}</dd>
          </dl>
        )}
      </div>
    </article>
  );
}

async function ArtistGrid() {
  await connection();
  const list = await getArtistsWithShows();
  const must = list.filter((a) => a.priority === "Must-see").length;
  const playing = list.filter((a) => a.showCount > 0);
  const waiting = list.filter((a) => a.showCount === 0);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 pb-24 md:px-6">
      <p className="font-mono text-xs text-[#999] uppercase">
        {must} Must-see · {list.length - must} Like · {playing.length} playing soon · {waiting.length} waiting for dates
      </p>
      <section>
        <SectionHeader title="Playing soon" note="Have shows coming up in Bengaluru, Mumbai or Chennai." count={playing.length} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {playing.map((a) => (
            <ArtistCard key={a.id} a={a} />
          ))}
        </div>
      </section>
      <section>
        <SectionHeader title="Waiting for dates" note="No India dates announced yet. The radar keeps watching them." count={waiting.length} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {waiting.map((a) => (
            <ArtistCard key={a.id} a={a} />
          ))}
        </div>
      </section>
    </div>
  );
}
