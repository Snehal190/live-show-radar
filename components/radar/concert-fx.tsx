/** Decorative concert layers for the hero: confetti, crowd silhouette, equalizer, ticker. */

const CONFETTI_COLORS = ["#ffe08a", "#ff8f8f", "#52a8ff", "#62c073", "#ffffff"];

// Deterministic pseudo-random so server and client render the same confetti.
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function ConfettiField({ count = 34 }: { count?: number }) {
  return (
    <div className="confetti-field" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${rand(i, 1) * 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDuration: `${7 + rand(i, 2) * 8}s`,
              animationDelay: `${-rand(i, 3) * 14}s`,
              width: `${5 + rand(i, 4) * 5}px`,
              height: `${8 + rand(i, 5) * 8}px`,
              "--drift": `${(rand(i, 6) - 0.5) * 160}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A crowd with hands in the air, as a dark silhouette at the bottom of the hero. */
export function Crowd() {
  const people = Array.from({ length: 34 }, (_, i) => {
    const x = i * 30 + rand(i, 7) * 14;
    const h = 46 + rand(i, 8) * 30; // shoulder height from bottom
    const up = rand(i, 9) > 0.45; // hands up?
    return { x, h, up, phone: rand(i, 10) > 0.85 };
  });
  return (
    <svg viewBox="0 0 1020 140" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[120px] w-full md:h-[160px]" aria-hidden>
      <defs>
        <linearGradient id="crowd-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b0b0b" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
      </defs>
      {people.map((p, i) => {
        const top = 140 - p.h;
        return (
          <g key={i} fill="url(#crowd-fade)">
            <circle cx={p.x + 15} cy={top - 12} r="11" />
            <path d={`M${p.x} 140 L${p.x + 2} ${top + 6} Q${p.x + 15} ${top - 4} ${p.x + 28} ${top + 6} L${p.x + 30} 140 Z`} />
            {p.up && (
              <>
                <path d={`M${p.x + 4} ${top + 8} L${p.x - 6} ${top - 34}`} stroke="#0b0b0b" strokeWidth="7" strokeLinecap="round" />
                <path d={`M${p.x + 26} ${top + 8} L${p.x + 36} ${top - 30}`} stroke="#0b0b0b" strokeWidth="7" strokeLinecap="round" />
                {p.phone && <rect x={p.x + 31} y={top - 46} width="9" height="14" rx="2" fill="#ffe08a" opacity="0.85" />}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Equalizer() {
  return (
    <span className="eq" aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

const TICKER = ["BENGALURU", "MUMBAI", "CHENNAI", "60 ARTISTS", "EARLY-BIRD ALERTS", "NEW SHOWS IN MINUTES", "NEVER MISS A GIG"];

export function Ticker() {
  const row = [...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden border-y border-white/10 bg-[#0a0a0a] py-3" aria-hidden>
      <div className="ticker">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {row.map((t, i) => (
              <span key={`${k}-${i}`} className="flex items-center font-mono text-sm tracking-widest">
                <span className={i % 2 ? "text-coral" : "text-gold"}>{t}</span>
                <span className="mx-6 text-[#52a8ff]">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
