/**
 * Original dancing-fan avatar under a spotlight (pure SVG + CSS keyframes in globals.css).
 * Decorative only: aria-hidden, and prefers-reduced-motion freezes it.
 */
export function Dancer({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 200 270" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="spot-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9a6" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#ffd65a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffd65a" stopOpacity="0.06" />
          </linearGradient>
          <radialGradient id="spot-pool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd65a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffd65a" stopOpacity="0" />
          </radialGradient>
          <filter id="spot-blur" x="-30%" y="-10%" width="160%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* spotlight: lamp, cone, floor pool */}
        <g className="dance-spot">
          <polygon points="90,-60 110,-60 178,250 22,250" fill="url(#spot-cone)" filter="url(#spot-blur)" />
        </g>
        <rect x="88" y="-74" width="24" height="14" rx="3" fill="#2b2b2b" />
        <circle cx="100" cy="-60" r="5" fill="#fff6d6" className="dance-lamp" />
        <ellipse cx="100" cy="246" rx="78" ry="14" fill="url(#spot-pool)" className="dance-pool" />

        {/* music notes */}
        <text x="34" y="120" className="dance-note" fill="#ffd65a" fontSize="20">♪</text>
        <text x="156" y="96" className="dance-note dance-note-2" fill="#52a8ff" fontSize="18">♫</text>
        <text x="150" y="160" className="dance-note dance-note-3" fill="#ededed" fontSize="16">♪</text>

        {/* legs (step in turns) */}
        <g className="dance-leg-l">
          <path d="M92 158 L86 208 L80 232" stroke="#1f1f1f" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M70 236 Q80 228 90 236 Z" fill="#ededed" stroke="#ededed" strokeWidth="5" strokeLinejoin="round" />
        </g>
        <g className="dance-leg-r">
          <path d="M108 158 L114 208 L120 232" stroke="#1f1f1f" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M110 236 Q120 228 130 236 Z" fill="#ededed" stroke="#ededed" strokeWidth="5" strokeLinejoin="round" />
        </g>

        {/* upper body bobs on the beat */}
        <g className="dance-body">
          {/* left arm swings */}
          <g className="dance-arm-l">
            <path d="M82 104 L62 130 L56 154" stroke="#e0ac69" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M82 104 L70 120" stroke="#ffd65a" strokeWidth="12" strokeLinecap="round" />
            <circle cx="56" cy="156" r="6" fill="#e0ac69" />
          </g>
          {/* right arm pumps in the air */}
          <g className="dance-arm-r">
            <path d="M118 104 L138 78 L146 50" stroke="#e0ac69" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M118 104 L130 88" stroke="#ffd65a" strokeWidth="12" strokeLinecap="round" />
            <circle cx="147" cy="45" r="7" fill="#e0ac69" />
          </g>
          {/* torso */}
          <path d="M80 100 Q100 92 120 100 L125 160 Q100 166 75 160 Z" fill="#ffd65a" />
          <circle cx="100" cy="128" r="10" fill="none" stroke="#1f1f1f" strokeWidth="2.5" />
          <circle cx="100" cy="128" r="4" fill="none" stroke="#1f1f1f" strokeWidth="2" />
          <path d="M100 128 L107 121" stroke="#52a8ff" strokeWidth="2.5" strokeLinecap="round" />
          {/* neck + head (nods) */}
          <rect x="95" y="84" width="10" height="14" rx="3" fill="#e0ac69" />
          <g className="dance-head">
            <circle cx="100" cy="66" r="21" fill="#e0ac69" />
            <path d="M79 64 Q80 42 100 42 Q122 42 121 62 Q112 52 100 54 Q88 52 79 64 Z" fill="#2b2b2b" />
            <rect x="85" y="61" width="13" height="8" rx="3" fill="#000" />
            <rect x="102" y="61" width="13" height="8" rx="3" fill="#000" />
            <path d="M98 64 L102 64" stroke="#000" strokeWidth="2" />
            <path d="M93 76 Q100 81 107 76" stroke="#7a4a2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            {/* headphones */}
            <path d="M76 66 Q76 36 100 36 Q124 36 124 66" stroke="#52a8ff" strokeWidth="4" fill="none" strokeLinecap="round" />
            <rect x="71" y="60" width="10" height="16" rx="4" fill="#52a8ff" />
            <rect x="119" y="60" width="10" height="16" rx="4" fill="#52a8ff" />
          </g>
        </g>
      </svg>
    </div>
  );
}
