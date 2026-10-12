"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * When the Radar opens, ask the server for a catch-up scan (debounced server-side to once
 * per 2 minutes). Runs after render so the page never waits on it.
 */
export function CatchupScan() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/scan/catchup", { method: "POST" });
        const data: { created?: number; skipped?: string } = await res.json();
        if (cancelled) return;
        if (data.created && data.created > 0) {
          setNote(`Radar swept: ${data.created} new alert${data.created === 1 ? "" : "s"}`);
          router.refresh();
        } else if (!data.skipped) setNote("Radar swept: sab up to date");
      } catch {
        /* the 5-minute cron covers it */
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [router]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4500);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <AnimatePresence>
      {note && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-20 left-1/2 z-50 -translate-x-1/2 v-chip !normal-case !text-[#ededed] shadow-[0_0_0_1px_rgba(255,255,255,0.145)]"
        >
          {note}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
