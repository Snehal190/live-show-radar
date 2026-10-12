import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fade + rise on first paint. Pure CSS (tw-animate-css), so content never waits for JS and
 * prefers-reduced-motion (handled in globals.css) turns it off.
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string; onMount?: boolean }) {
  return (
    <div className={cn("animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-700 ease-out", className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
