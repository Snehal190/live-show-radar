"use client";

import { CheckCheck, MailCheck, MailX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAlertsRead } from "@/app/actions";
import { shouldEmail } from "@/lib/alerts/email-policy";
import type { AlertView } from "@/lib/server/views";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  critical: "border-radar/50 glow-critical",
  high: "border-orange-300/25",
  medium: "border-yellow-200/20",
  low: "border-white/10",
  info: "border-white/5 opacity-75",
};

export function AlertRow({ a, when }: { a: AlertView; when: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const open = () =>
    start(async () => {
      if (!a.readAt) await markAlertsRead({ alertId: a.id });
      router.push(a.showId ? `/shows/${a.showId}` : "/alerts");
    });
  const emailState = a.emailedAt && !a.isHistorical && !a.emailError?.startsWith("dry run")
    ? { icon: MailCheck, text: "email sent" }
    : !shouldEmail(a.type, a.showStatus)
    ? { icon: null, text: a.urgency === "info" ? "dashboard only" : "in-app only · tap Remind me for emails" }
    : a.isHistorical
      ? { icon: MailCheck, text: "seeded history" }
      : a.emailedAt
        ? { icon: MailCheck, text: a.emailError?.startsWith("dry run") ? "logged (dry run)" : "email sent" }
        : a.emailError
          ? { icon: MailX, text: "email failed" }
          : { icon: null, text: "email pending" };
  const Icon = emailState.icon;
  return (
    <button type="button" onClick={open} className={cn("relative flex w-full items-start gap-4 rounded-2xl border bg-[#0a0a0a] p-4 text-left transition-colors hover:border-white/30 md:p-5", TONE[a.urgency])}>
      <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", a.readAt ? "bg-transparent" : "bg-[#52a8ff]")} aria-label={a.readAt ? "read" : "unread"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-wide text-white/45 uppercase">
          <span className={cn("font-semibold", a.urgency === "critical" && "text-[#52a8ff]")}>{a.urgency}</span>
          <span>· {a.type.replace(/_/g, " ")}</span>
          {a.city && <span>· {a.city}</span>}
          {a.copyBy === "gemini" && <span className="normal-case text-src-gemini">✦ Gemini copy</span>}
        </div>
        <p className={cn("mt-1.5 font-medium md:text-lg", !a.readAt && "text-white")}>{a.headline}</p>
        <p className="text-sm text-white/60">{a.body}</p>
        {a.artists.length > 1 && <p className="mt-1 text-xs text-white/40">Lineup: {a.artists.join(", ")}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-white/40">
          <span>{when}</span>
          <span className={cn("inline-flex items-center gap-1", emailState.text === "email sent" && "text-[#62c073]", emailState.text === "email failed" && "text-[#ededed]")}>
            {Icon && <Icon className="size-3.5" />} {emailState.text}
          </span>
          {a.verdict && <span>verdict: {a.verdict}</span>}
        </p>
      </div>
    </button>
  );
}

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={disabled || pending} onClick={() => start(async () => void (await markAlertsRead({})))} className="btn-square text-sm disabled:opacity-40">
      <CheckCheck className="size-4" /> Mark all read
    </button>
  );
}
