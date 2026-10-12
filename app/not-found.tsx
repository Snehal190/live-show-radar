import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center px-4 pt-32">
      <p className="text-xs font-semibold tracking-wider text-white/40 uppercase">404 · off the radar</p>
      <h1 className="mt-3  text-5xl tracking-tight md:text-6xl">
        This show isn&apos;t <span className="italic">on the radar.</span>
      </h1>
      <p className="mt-4 text-white/60">It may not be announced yet, or the link is wrong.</p>
      <Link href="/" className="btn-square mt-8 px-5 py-3 text-sm">
        Back to the Radar
      </Link>
    </div>
  );
}
