"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CityTabs({ tabs }: { tabs: { id: string; label: string; count: number; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" aria-label="City" className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            onClick={() => setActive(t.id)}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-1.5 text-sm transition-colors",
              t.id === current?.id ? "bg-white text-[#121212]" : "text-[#999] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.145)] hover:text-white",
            )}
          >
            {t.label} <span className={cn("ml-1.5 font-mono text-xs", t.id === current?.id ? "text-[#121212]/50" : "text-[#666]")}>{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
