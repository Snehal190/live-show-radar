"use client";

import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center px-4 pt-32">
      <TriangleAlert className="size-7 text-radar" />
      <h1 className="mt-4  text-5xl tracking-tight">The radar lost signal.</h1>
      <p className="mt-3 text-white/60">Something on our side didn&apos;t answer. Scans keep running in the background; try again in a moment.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-white/35">ref {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-square mt-8 px-5 py-3 text-sm">
        Try again
      </button>
    </div>
  );
}
