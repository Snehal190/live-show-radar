import { TriangleAlert } from "lucide-react";

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-8">
        <TriangleAlert className="size-6 text-red-300" />
        <h2 className="mt-3  text-2xl">The radar lost signal</h2>
        <p className="mt-2 text-white/60">The database didn&apos;t answer. Cached pages will come back as soon as it does.</p>
        <p className="mt-4 font-mono text-xs break-all text-white/40">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, note }: { title: string; note?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 px-6 py-8 text-center">
      <p className="text-base text-[#ededed]">{title}</p>
      {note && <p className="mt-1 font-mono text-xs text-[#999]">{note}</p>}
    </div>
  );
}
