"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Radar" },
  { href: "/shows", label: "Shows" },
  { href: "/timeline", label: "Calendar" },
  { href: "/artists", label: "Artists" },
  { href: "/plans", label: "My Plans" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[20px] font-medium tracking-tight text-white">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <circle cx="13" cy="13" r="12" stroke="white" strokeOpacity="0.9" />
        <circle cx="13" cy="13" r="7" stroke="white" strokeOpacity="0.45" />
        <path d="M13 13 L22.5 5.5" stroke="#52a8ff" strokeWidth="1.6" strokeLinecap="square" />
        <rect x="11.5" y="11.5" width="3" height="3" fill="white" />
      </svg>
      Live Show Radar
    </Link>
  );
}

function InboxCta({ unread }: { unread: number }) {
  return (
    <Link href="/alerts" className="btn-square text-sm">
      Inbox
      {unread > 0 && <span className="font-mono text-xs text-[#52a8ff]">{unread > 99 ? "99+" : unread}</span>}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

export function SiteNav({ unread }: { unread: number }) {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // The menu belongs to the page it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      <nav className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "border-b border-white/10 bg-black/80 py-3 backdrop-blur-md" : "bg-transparent py-5 md:py-7")}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <Logo />
          <div className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={cn("text-[15px] transition-colors", active(l.href) ? "text-white" : "text-[#999] hover:text-white")}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="hidden md:block">
            <InboxCta unread={unread} />
          </div>
          <button type="button" onClick={() => setOpenOn(open ? null : path)} className="grid size-10 place-items-center md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black px-6 pt-24 pb-10 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn("border-b border-white/10 py-4 text-3xl tracking-tight", active(l.href) ? "text-white" : "text-[#999]")}>
              {l.label}
            </Link>
          ))}
          <div className="mt-8">
            <InboxCta unread={unread} />
          </div>
        </div>
      )}
    </>
  );
}

/** Hook-free shell for the prerendered static fallback (no pathname, no unread count). */
export function SiteNavShell() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 bg-transparent py-5 md:py-7">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Logo />
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[15px] text-[#999]">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="hidden md:block">
          <InboxCta unread={0} />
        </div>
      </div>
    </nav>
  );
}
