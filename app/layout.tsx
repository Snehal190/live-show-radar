import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Owl } from "@/components/radar/owl";
import { SiteNav, SiteNavShell } from "@/components/radar/site-nav";
import { unreadAlertCount } from "@/lib/server/views";
import "./globals.css";

// Inter's optical-size axis gives the "Inter Display" cut automatically at headline sizes.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Live Show Radar", template: "%s · Live Show Radar" },
  description: "Karan's concert radar: every show by his 60 artists in Bengaluru, Mumbai and Chennai, the moment it's announced.",
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

async function NavWithCount() {
  await connection();
  let unread = 0;
  try {
    unread = await unreadAlertCount();
  } catch {
    /* DB down: still render the nav */
  }
  return <SiteNav unread={unread} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geist.variable} ${mono.variable} dark antialiased`}>
      <body className="min-h-dvh">
        <div className="stage-lights" aria-hidden />
        <div className="spotlights" aria-hidden>
          <div className="beam left" />
          <div className="beam center" />
          <div className="beam right" />
          <div className="pool" />
          <span className="rig" style={{ left: "17vw" }} />
          <span className="rig" style={{ left: "50vw" }} />
          <span className="rig" style={{ right: "17vw" }} />
        </div>
        <Suspense fallback={<SiteNavShell />}>
          <NavWithCount />
        </Suspense>
        <main className="min-h-dvh">{children}</main>
        <footer className="mt-16 border-t border-white/10 py-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 font-mono text-xs text-[#999] md:flex-row md:items-center md:justify-between md:px-6">
            <p>
              Live Show Radar · made for Karan, who never wants to miss a show again <span aria-hidden>🎶</span>
            </p>
            <div className="flex flex-wrap gap-5">
              <Link href="/live-feed" className="hover:text-white">
                How it stays fresh
              </Link>
              <a href="https://github.com/Snehal190/live-show-radar" className="hover:text-white">
                GitHub
              </a>
            </div>
          </div>
        </footer>
        <Owl />
      </body>
    </html>
  );
}
