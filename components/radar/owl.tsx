"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

interface OwlData {
  lastScanAt: string | null;
  newShowsSinceVisit: number;
}

const FLIGHT_SECONDS = 2.4;

/** Straight up off the perch, hover with a little bob, then drop back down and settle. */
const FLIGHT = {
  y: [0, -150, -170, -150, -165, 0, -14, 0],
  rotate: [0, -4, 3, -3, 2, 0, 0, 0],
  scale: [1, 1.05, 1.06, 1.05, 1.06, 1, 0.97, 1],
  times: [0, 0.3, 0.42, 0.52, 0.62, 0.86, 0.93, 1],
};

const FLIGHT_LINES = ["Udd raha hoon… 🦉", "Logs padh raha hoon…", "SerpApi ki diary check…", "Bas, aa gaya…"];

function minsAgo(iso: string | null): string {
  if (!iso) return "abhi tak nahi";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m === 0) return "abhi abhi";
  if (m < 60) return `${m} min pehle`;
  const h = Math.floor(m / 60);
  return `${h} ghante pehle`;
}

function OwlSvg({ blink, flapping }: { blink: boolean; flapping: boolean }) {
  return (
    <svg viewBox="0 0 120 130" className="h-full w-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]" aria-hidden>
      {/* branch */}
      <path d="M8 118 Q60 110 112 120" stroke="#333333" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M92 116 q8 -8 16 -6" stroke="#333333" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* wings */}
      <motion.g style={{ originX: "28px", originY: "62px" }} animate={flapping ? { rotate: [0, -38, 0] } : { rotate: 0 }} transition={flapping ? { duration: 0.28, repeat: Infinity } : { duration: 0.3 }}>
        <path d="M28 58 C10 70 12 96 30 104 C34 88 34 72 28 58Z" fill="#2b2b2b" />
        <path d="M24 74 q4 6 3 14 M21 84 q4 5 3 11" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </motion.g>
      <motion.g style={{ originX: "92px", originY: "62px" }} animate={flapping ? { rotate: [0, 38, 0] } : { rotate: 0 }} transition={flapping ? { duration: 0.28, repeat: Infinity } : { duration: 0.3 }}>
        <path d="M92 58 C110 70 108 96 90 104 C86 88 86 72 92 58Z" fill="#2b2b2b" />
        <path d="M96 74 q-4 6 -3 14 M99 84 q-4 5 -3 11" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </motion.g>
      {/* body */}
      <path d="M60 22 C34 22 24 44 26 70 C28 96 42 112 60 112 C78 112 92 96 94 70 C96 44 86 22 60 22Z" fill="#3d3d3d" />
      {/* ear tufts */}
      <path d="M34 34 L28 14 L46 28Z" fill="#3d3d3d" />
      <path d="M86 34 L92 14 L74 28Z" fill="#3d3d3d" />
      <path d="M33 28 L30 18 L40 26Z" fill="#52a8ff" opacity="0.85" />
      <path d="M87 28 L90 18 L80 26Z" fill="#52a8ff" opacity="0.85" />
      {/* belly */}
      <path d="M60 64 C44 64 38 80 40 94 C42 106 50 110 60 110 C70 110 78 106 80 94 C82 80 76 64 60 64Z" fill="#b5b5b5" />
      <path d="M50 80 l4 4 l4 -4 M62 80 l4 4 l4 -4 M54 92 l4 4 l4 -4 M46 92 l3 3 M68 92 l4 4 l3 -3 M56 102 l4 3 l4 -3" stroke="#6e6e6e" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* face disc */}
      <path d="M60 30 C44 30 32 38 32 52 C32 64 44 70 60 64 C76 70 88 64 88 52 C88 38 76 30 60 30Z" fill="#e6e6e6" />
      {/* eyes */}
      <circle cx="46" cy="50" r="11" fill="#fff" />
      <circle cx="74" cy="50" r="11" fill="#fff" />
      <circle cx="46" cy="50" r="7" fill="#52a8ff" />
      <circle cx="74" cy="50" r="7" fill="#52a8ff" />
      <circle cx="46" cy="50" r="4" fill="#000000" />
      <circle cx="74" cy="50" r="4" fill="#000000" />
      <circle cx="44" cy="48" r="1.6" fill="#fff" />
      <circle cx="72" cy="48" r="1.6" fill="#fff" />
      {/* eyelids */}
      <motion.rect x="34" y="38" width="24" height="24" rx="12" fill="#3d3d3d" style={{ originY: "38px" }} initial={{ scaleY: 0 }} animate={{ scaleY: blink ? 1 : 0 }} transition={{ duration: 0.09 }} />
      <motion.rect x="62" y="38" width="24" height="24" rx="12" fill="#3d3d3d" style={{ originY: "38px" }} initial={{ scaleY: 0 }} animate={{ scaleY: blink ? 1 : 0 }} transition={{ duration: 0.09 }} />
      {/* beak */}
      <path d="M56 58 L64 58 L60 67Z" fill="#ededed" />
      {/* feet */}
      <path d="M50 110 l-3 7 M53 111 l0 7 M56 110 l3 7 M64 110 l-3 7 M67 111 l0 7 M70 110 l3 7" stroke="#ededed" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Global mascot. UI only: it reads /api/owl (app_meta + sync_log) and never starts a scan.
 */
export function Owl() {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const [data, setData] = useState<OwlData | null>(null);
  const [blink, setBlink] = useState(false);
  const [flying, setFlying] = useState(false);
  const [hover, setHover] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    fetch("/api/owl?visit=1")
      .then((r) => r.json())
      .then((d: OwlData) => setData(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2600 + Math.random() * 3800);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduce]);

  const tap = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    const fetching = fetch("/api/owl", { cache: "no-store" })
      .then((r) => r.json() as Promise<OwlData>)
      .catch(() => data);
    if (!reduce) {
      setFlying(true);
      let i = 0;
      setLine(FLIGHT_LINES[0]);
      const rot = setInterval(() => {
        i = (i + 1) % FLIGHT_LINES.length;
        setLine(FLIGHT_LINES[i]);
      }, 600);
      void controls.start({ y: FLIGHT.y, rotate: FLIGHT.rotate, scale: FLIGHT.scale, transition: { duration: FLIGHT_SECONDS, ease: "easeInOut", times: FLIGHT.times } });
      // Timer, not the animation promise: background tabs pause rAF and would strand the owl mid-air.
      await new Promise((r) => setTimeout(r, FLIGHT_SECONDS * 1000 + 150));
      clearInterval(rot);
      setFlying(false);
      setLine(null);
    }
    const d = (await fetching) ?? data;
    if (d) setData(d);
    const checked = `Maine ${minsAgo(d?.lastScanAt ?? null)} check kiya.`;
    setMessage(d && d.newShowsSinceVisit > 0 ? `Mil gaya! ${d.newShowsSinceVisit} naye show${d.newShowsSinceVisit === 1 ? "" : "s"} 🎉 ${checked}` : `Sab shaant hai. Jaise hi kuch aayega, main khud bata dunga. ${checked}`);
    busy.current = false;
  }, [controls, data, reduce]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 7000);
    return () => clearTimeout(t);
  }, [message]);

  const bubble = line ?? message ?? (hover && !flying ? `Last checked: ${minsAgo(data?.lastScanAt ?? null)}` : null);

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-40 flex flex-col items-end md:right-6 md:bottom-6">
      <AnimatePresence>
        {bubble && (
          <motion.div
            key="owl-bubble"
            role="status"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 max-w-[250px] rounded-lg rounded-br-none bg-[#0a0a0a] px-3.5 py-2.5 font-mono text-xs leading-relaxed text-[#ededed] shadow-[0_0_0_1px_rgba(255,255,255,0.145)] shadow-xl backdrop-blur"
          >
            {bubble}
            {hover && !line && !message && <span className="mt-1 block text-[10px] text-white/50">Just for fun — scanning runs on its own every 5 minutes.</span>}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Flight lives on the wrapper; the hover lift lives on the button, so they never fight over y. */}
      <motion.div animate={controls} className="pointer-events-none" style={{ willChange: "transform" }}>
      <motion.button
        type="button"
        onClick={tap}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label="Radar owl: tap to hear when the app last checked (just for fun; scanning runs on its own every 5 minutes)"
        title="Just for fun — scanning runs on its own every 5 minutes."
        className="pointer-events-auto size-[74px] cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#52a8ff] md:size-[88px]"
        whileHover={reduce || flying ? undefined : { y: -3 }}
      >
        <OwlSvg blink={blink} flapping={flying} />
      </motion.button>
      </motion.div>
    </div>
  );
}
