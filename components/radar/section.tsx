import { Reveal } from "./reveal";

export function SectionHeader({ eyebrow, title, note, count, tone = "gold" }: { eyebrow?: string; title: string; note?: string; count?: number; tone?: "gold" | "coral" }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className={`font-mono text-xs tracking-wider uppercase ${tone === "gold" ? "text-coral" : "text-gold"}`}>{eyebrow}</p>}
      <h2 className={`mt-1 text-2xl md:text-[32px] ${tone === "gold" ? "!text-[#ffe08a]" : "!text-[#ff8f8f]"}`}>
        {title}
        {typeof count === "number" && <span className="ml-3 align-middle font-mono text-sm text-[#999]">{count}</span>}
      </h2>
      {note && <p className="mt-1.5 text-[15px] text-[#999]">{note}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, italic, note }: { eyebrow: string; title: string; italic?: string; note?: string }) {
  return (
    <header className="pt-28 pb-10 md:pt-36">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <Reveal>
          <p className="text-coral font-mono text-xs tracking-wider uppercase">{eyebrow}</p>
          <h1 className="mt-3 max-w-[752px] text-[clamp(2rem,5vw,3.75rem)] leading-[1.05] tracking-[-0.045em]">
            {title} {italic && <span className="text-gold glow-gold">{italic}</span>}
          </h1>
          {note && <p className="mt-4 max-w-2xl text-base text-[#e7e7e7]/80">{note}</p>}
        </Reveal>
      </div>
    </header>
  );
}
