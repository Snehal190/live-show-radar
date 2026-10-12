"use client";

import { useState, useTransition } from "react";
import { setArtistPriority } from "@/app/actions";
import { cn } from "@/lib/utils";

export function PriorityToggle({ artistId, priority }: { artistId: string; priority: "Must-see" | "Like" }) {
  const [cur, setCur] = useState(priority);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const set = (p: "Must-see" | "Like") => {
    if (p === cur) return;
    const prev = cur;
    setCur(p);
    setErr(null);
    start(async () => {
      const r = await setArtistPriority({ artistId, priority: p });
      if (!r.ok) {
        setCur(prev);
        setErr(r.error);
      }
    });
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Priority" className={cn("inline-flex rounded-lg p-0.5 text-xs shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)]", pending && "opacity-70")}>
        {(["Must-see", "Like"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={cur === p} onClick={() => set(p)} className={cn("rounded-lg px-3 py-1 font-mono transition-colors", cur === p ? (p === "Must-see" ? "bg-[#ff8f8f] text-[#121212]" : "bg-white text-[#121212]") : "text-[#999] hover:text-white")}>
            {p}
          </button>
        ))}
      </div>
      {err && <p className="mt-1 text-xs text-red-300">{err}</p>}
    </div>
  );
}
