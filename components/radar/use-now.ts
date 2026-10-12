"use client";

import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};
// Rounded to the second so the snapshot is stable between renders within a tick.
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;

/** Ticking clock (ms). `null` during SSR/hydration, so server and client markup match. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
