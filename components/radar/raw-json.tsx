"use client";

import { Braces } from "lucide-react";
import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface RawRow {
  id: number;
  title: string;
  query: string | null;
  page: number;
  fetchedAt: string;
  rawJson: unknown;
  parsedCity: string | null;
  parsedStartsAt: string | null;
  matchMethod: string;
  matchConfidence: number | null;
  skipReason: string | null;
  show: { id: number; artist: string; eventName: string; city: string; when: string } | null;
}

export function RawJsonDrawer({ row }: { row: RawRow }) {
  return (
    <Sheet>
      <SheetTrigger className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-xs text-[#ededed] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:bg-white/5">
        <Braces className="size-3.5" /> JSON
      </SheetTrigger>
      <SheetContent side="right" className="w-full border-white/10 bg-black sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-2xl">{row.title}</SheetTitle>
          <SheetDescription>
            serp_raw_events #{row.id} · {row.query} · page {row.page}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-8">
          <div className="rounded-2xl tech-card p-4 text-sm">
            <p className="text-xs tracking-wide text-white/45 uppercase">Matched show</p>
            {row.show ? (
              <Link href={`/shows/${row.show.id}`} className="mt-1 block hover:underline">
                <span className="text-lg">{row.show.artist}</span>
                <span className="block text-white/60">
                  {row.show.eventName} · {row.show.city} · {row.show.when}
                </span>
              </Link>
            ) : (
              <p className="mt-1 text-white/60">{row.skipReason ? `Not considered: ${row.skipReason}` : "No artist match"}</p>
            )}
            <p className="mt-2 text-xs text-white/45">
              Match: {row.matchMethod}
              {row.matchConfidence !== null ? ` (${Math.round(row.matchConfidence * 100)}%)` : ""} · parsed city {row.parsedCity ?? "—"}
            </p>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90">{JSON.stringify(row.rawJson, null, 2)}</pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}
