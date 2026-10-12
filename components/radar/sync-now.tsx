"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Countdown } from "./countdown";
import { useNow } from "./use-now";

type Result = { queryId?: string; sync?: { results: number; matched: number; newShows: number; skipped?: string; quotaUsed: number; quotaLimit: number }; error?: string; nextAt?: string | null };

/** Global, server-enforced limit: one manual SerpApi call per 60 minutes. */
export function SyncNow({ initialNextAt }: { initialNextAt: string | null }) {
  const router = useRouter();
  const [nextAt, setNextAt] = useState(initialNextAt);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const now = useNow();
  const locked = nextAt !== null && now !== null && new Date(nextAt).getTime() > now;

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/sync-now", { method: "POST" });
      const data: Result = await res.json();
      if (data.nextAt) setNextAt(data.nextAt);
      if (res.status === 429) setResult("Someone synced in the last hour. Cron keeps it fresh meanwhile.");
      else if (data.error) setResult(`Sync failed: ${data.error}`);
      else if (data.sync?.skipped) setResult(`Skipped: ${data.sync.skipped}`);
      else if (data.sync) setResult(`${data.queryId}: ${data.sync.results} events returned · ${data.sync.matched} matched · ${data.sync.newShows} new shows · quota ${data.sync.quotaUsed}/${data.sync.quotaLimit}`);
      router.refresh();
    } catch {
      setResult("Network error. Try again in a bit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || locked}
        className="btn-square px-5 py-3 text-base disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/60"
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Asking Google Events…" : locked && nextAt ? <Countdown to={nextAt} prefix="Sync now available in" done="Sync now" compact /> : "Sync now"}
      </button>
      {result && <p className="max-w-md text-sm text-white/70">{result}</p>}
    </div>
  );
}
