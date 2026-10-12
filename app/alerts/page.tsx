import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertRow, MarkAllRead } from "@/components/radar/alert-row";
import { PageHeader } from "@/components/radar/section";
import { EmptyState } from "@/components/radar/states";
import { getAlertViews } from "@/lib/server/views";
import { formatIst, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

const URGENCIES = ["all", "critical", "high", "medium", "low", "info"];
const TYPES = ["all", "new_show", "festival", "eb_live", "eb_closing", "nudge", "decide_soon", "show_week", "tonight", "missed", "eb_sold_out"];

export default function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  return (
    <>
      <PageHeader eyebrow="One email per alert" title="Alerts" italic="inbox." note="Everything the radar told Karan. Facts come from the database; the one-liners come from Gemini Flash (or a template if Gemini is unavailable)." />
      <Suspense fallback={<div className="mx-auto h-96 max-w-4xl animate-pulse rounded-xl bg-white/5" />}>
        <AlertsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AlertsList({ searchParams }: { searchParams: PageProps<"/alerts">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const urgency = typeof sp.urgency === "string" && URGENCIES.includes(sp.urgency) ? sp.urgency : "all";
  const type = typeof sp.type === "string" && TYPES.includes(sp.type) ? sp.type : "all";
  const now = new Date();
  const all = await getAlertViews();
  const list = all.filter((a) => (urgency === "all" || a.urgency === urgency) && (type === "all" || a.type === type));
  const unread = all.filter((a) => !a.readAt).length;
  const href = (p: Record<string, string>) => {
    const q = new URLSearchParams({ urgency, type, ...p });
    for (const [k, v] of [...q.entries()]) if (v === "all") q.delete(k);
    return `/alerts${q.size ? `?${q}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-white/55">
          <span className="font-semibold text-white">{unread}</span> unread · {all.length} total
        </p>
        <MarkAllRead disabled={unread === 0} />
      </div>
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {URGENCIES.map((u) => (
            <Link key={u} href={href({ urgency: u })} scroll={false} className={cn("rounded-lg px-3 py-1 font-mono text-sm capitalize", urgency === u ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:text-white")}>
              {u}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Link key={t} href={href({ type: t })} scroll={false} className={cn("rounded-lg px-3 py-1 font-mono text-xs", type === t ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:text-white")}>
              {t.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No alerts here" note="The radar is quiet for this filter." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <AlertRow key={a.id} a={a} when={`${formatIst(new Date(a.createdAt), "EEE d MMM, h:mm a")} IST · ${timeAgo(new Date(a.createdAt), now)}`} />
          ))}
        </div>
      )}
    </div>
  );
}
