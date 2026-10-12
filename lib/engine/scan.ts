import "server-only";
import { and, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { generateCopy, qualitativeEarlyBird, type CopyRequest } from "@/lib/ai/copy";
import { generateVerdicts, type VerdictRequest } from "@/lib/ai/verdict";
import { DETECTOR_EMAIL_TYPES, isAlreadyAccepted, MAX_EMAIL_ATTEMPTS, REMINDER_EMAIL_TYPES, REMINDER_OPT_IN } from "@/lib/alerts/email-policy";
import { buildFacts } from "@/lib/alerts/facts";
import { getDb } from "@/lib/db";
import { alertRules, alerts, artists, shows, type Artist, type NewAlert, type Show } from "@/lib/db/schema";
import { renderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { getEnv } from "@/lib/env";
import {
  ebState,
  festivalGroupKey,
  groupFestivalAnnouncements,
  idempotencyKey,
  isAlertable,
  isNewlyAnnounced,
  needsVerdict,
  newShowUrgency,
  REMINDER_URGENCY,
  selectReminders,
  shouldNudge,
  URGENCY_RANK,
  type AlertKind,
  type PastAlert,
  type Priority,
  type Urgency,
} from "@/lib/logic/rules";
import { claimSlot, setMeta } from "@/lib/server/meta";
import { errorText, finishLog, startLog } from "@/lib/server/synclog";
import { DAY_MS, isWeekendIst, istDate, istDaysBetween } from "@/lib/time";

interface Row {
  show: Show;
  artist: Artist;
}

interface Planned {
  subject: string;
  type: AlertKind;
  urgency: Urgency;
  members: Row[];
}

export interface ScanSummary {
  skipped?: string;
  planned: number;
  created: number;
  emailed: number;
  emailErrors: number;
  verdicts: number;
  copyBy: { gemini: number; template: number };
  byType: Record<string, number>;
}

const MAX_VERDICT_BACKFILL = 8;
const EMAIL_SPACING_MS = 600;
/** Emails go out for announcements and anything ticket-critical; softer reminders stay on the dashboard. */
const DETECTOR_LIST: NewAlert["type"][] = [...DETECTOR_EMAIL_TYPES];
const REMINDER_LIST: NewAlert["type"][] = [...REMINDER_EMAIL_TYPES]; // Resend free tier: 2 requests/second

function artistLabel(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}

/** Detector → Reminder → Smart nudge → city rule → urgency → idempotent alerts → copy → email. */
export async function runScan(trigger: "cron" | "catchup" | "manual", now = new Date()): Promise<ScanSummary> {
  const empty: ScanSummary = { planned: 0, created: 0, emailed: 0, emailErrors: 0, verdicts: 0, copyBy: { gemini: 0, template: 0 }, byType: {} };
  if (!(await claimSlot("scan_lock", 4 * 60_000, now))) return { ...empty, skipped: "another scan is running" };
  const logId = await startLog("scan", { trigger, description: `Scan (${trigger})` });
  try {
    const summary = await scanInner(now);
    await setMeta("last_scan_at", new Date().toISOString());
    await finishLog(logId, {
      alertsCreated: summary.created,
      emailsSent: summary.emailed,
      resultsCount: summary.planned,
      description: `Scan (${trigger}) · ${Object.entries(summary.byType).map(([t, n]) => `${t}×${n}`).join(", ") || "nothing new"}`,
    });
    return summary;
  } catch (e) {
    await finishLog(logId, { error: errorText(e) });
    throw e;
  } finally {
    await setMeta("scan_lock", "");
  }
}

async function scanInner(now: Date): Promise<ScanSummary> {
  const db = getDb();
  const rules = await db.select().from(alertRules);
  const rows: Row[] = await db
    .select({ show: shows, artist: artists })
    .from(shows)
    .innerJoin(artists, eq(artists.id, shows.artistId))
    .where(lte(shows.announcedAt, now));
  const allAlerts = await db
    .select({ showId: alerts.showId, showIds: alerts.showIds, type: alerts.type, urgency: alerts.urgency, createdAt: alerts.createdAt, isHistorical: alerts.isHistorical })
    .from(alerts);

  const past = new Map<number, PastAlert[]>();
  for (const a of allAlerts) {
    const ids = new Set([...(a.showId ? [a.showId] : []), ...a.showIds]);
    for (const id of ids) past.set(id, [...(past.get(id) ?? []), a]);
  }
  const pastOf = (id: number) => past.get(id) ?? [];
  const priorityOf = (r: Row) => r.artist.priority as Priority;
  const alertable = rows.filter((r) => isAlertable(r.show, priorityOf(r), rules));
  const planned: Planned[] = [];
  const plannedFor = new Map<number, PastAlert[]>(); // alerts planned in this run, for coverage checks
  const plan = (p: Planned) => {
    planned.push(p);
    for (const m of p.members) plannedFor.set(m.show.id, [...(plannedFor.get(m.show.id) ?? []), { type: p.type, urgency: p.urgency, createdAt: now, isHistorical: false }]);
  };

  // 1. Detector: new announcements (festival lineups combined) and tiers that sold out.
  const fresh = alertable.filter((r) => r.show.startsAt > now && isNewlyAnnounced(r.show, pastOf(r.show.id), now));
  const freshShows = fresh.map((r) => r.show);
  const festivalShows = rows.filter((r) => r.show.eventType === "Festival").map((r) => r.show);
  const { festivals, singles } = groupFestivalAnnouncements(freshShows, festivalShows);
  const rowById = new Map(rows.map((r) => [r.show.id, r]));
  for (const s of singles) {
    const r = rowById.get(s.id) as Row;
    plan({ subject: String(s.id), type: "new_show", urgency: newShowUrgency(s, priorityOf(r), now), members: [r] });
  }
  for (const f of festivals) {
    const members = f.shows.map((s) => rowById.get(s.id) as Row);
    const urgency = members.map((m) => newShowUrgency(m.show, priorityOf(m), now)).sort((a, b) => URGENCY_RANK[a] - URGENCY_RANK[b])[0];
    plan({ subject: `fest-${f.key}`, type: "festival", urgency, members });
  }
  for (const r of alertable) {
    if (r.show.karanStatus === "skipped") continue;
    const p = pastOf(r.show.id);
    if (r.show.ebSoldOutAt && !p.some((a) => a.type === "eb_sold_out")) plan({ subject: String(r.show.id), type: "eb_sold_out", urgency: REMINDER_URGENCY.eb_sold_out, members: [r] });
    if (r.show.generalSoldOutAt && !p.some((a) => a.type === "general_sold_out")) plan({ subject: String(r.show.id), type: "general_sold_out", urgency: REMINDER_URGENCY.general_sold_out, members: [r] });
  }

  // 2. Reminder (festival siblings share one alert per type) + 3. Smart nudge.
  const reminderGroups = new Map<string, Planned>();
  for (const r of alertable) {
    const p = [...pastOf(r.show.id), ...(plannedFor.get(r.show.id) ?? [])];
    if (!p.some((a) => a.type === "new_show" || a.type === "festival")) continue; // not announced to Karan yet
    const due: AlertKind[] = selectReminders(r.show, p, now);
    if (shouldNudge(r.show, p, now)) due.push("nudge");
    for (const type of due) {
      const subject = r.show.eventType === "Festival" ? `fest-${festivalGroupKey(r.show)}` : String(r.show.id);
      const key = `${subject}|${type}`;
      const existing = reminderGroups.get(key);
      if (existing) existing.members.push(r);
      else reminderGroups.set(key, { subject, type, urgency: REMINDER_URGENCY[type as keyof typeof REMINDER_URGENCY], members: [r] });
    }
  }
  for (const g of reminderGroups.values()) plan(g);

  // 4. Worth-the-trip verdicts: new out-of-town Must-see announcements + a small backfill.
  const verdictRows = new Map<number, Row>();
  for (const p of planned) {
    if (p.type !== "new_show" && p.type !== "festival") continue;
    const m = p.members.find((x) => needsVerdict(x.show.city, priorityOf(x)) && !x.show.verdict);
    if (m) verdictRows.set(m.show.id, m);
  }
  for (const r of alertable) {
    if (verdictRows.size >= MAX_VERDICT_BACKFILL) break;
    if (!r.show.verdict && r.show.startsAt > now && needsVerdict(r.show.city, priorityOf(r))) verdictRows.set(r.show.id, r);
  }
  const verdictReqs: (VerdictRequest & { id: number })[] = [...verdictRows.values()].map((r) => {
    const day = istDate(r.show.startsAt);
    return {
      id: r.show.id,
      artist: r.artist.name,
      city: r.show.city,
      venue: r.show.venue,
      priority: priorityOf(r),
      weekend: isWeekendIst(r.show.startsAt),
      clashesWithGoing: rows.some((o) => o.show.id !== r.show.id && o.show.karanStatus === "going" && istDate(o.show.startsAt) === day),
      alsoPlaysBengaluru: rows.some((o) => o.show.artistId === r.show.artistId && o.show.city === "Bengaluru" && o.show.startsAt > now),
      daysOfNotice: istDaysBetween(now, r.show.startsAt),
      genre: r.artist.genre,
    };
  });
  const verdicts = await generateVerdicts(verdictReqs);
  for (let i = 0; i < verdictReqs.length; i++) {
    const v = verdicts[i];
    await db.update(shows).set({ verdict: v.verdict, verdictReason: v.reason, verdictBy: v.by, updatedAt: now }).where(eq(shows.id, verdictReqs[i].id));
    const r = verdictRows.get(verdictReqs[i].id);
    if (r) Object.assign(r.show, { verdict: v.verdict, verdictReason: v.reason, verdictBy: v.by });
  }

  // 5. Copy (one batched Gemini call, template fallback per item).
  const copyReqs: CopyRequest[] = planned.map((p) => {
    const lead = p.members[0];
    const names = [...new Set(p.members.map((m) => m.artist.name))];
    const st = ebState(lead.show, now);
    return {
      type: p.type,
      urgency: p.urgency,
      artist: artistLabel(names),
      priority: p.members.some((m) => priorityOf(m) === "Must-see") ? "Must-see" : "Like",
      city: lead.show.city,
      festivalName: p.type === "festival" ? lead.show.eventName.replace(/\s*\([^()]*\)\s*$/, "") : undefined,
      artistCount: p.type === "festival" ? names.length : undefined,
      venue: lead.show.venue,
      daysLeft: Math.max(0, istDaysBetween(now, lead.show.startsAt)),
      earlyBird: qualitativeEarlyBird(st, lead.show.ebClosesAt ? lead.show.ebClosesAt.getTime() - now.getTime() : null),
      karanStatus: lead.show.karanStatus,
    };
  });
  const copies = await generateCopy(copyReqs);

  // 6. Idempotent insert: the unique idempotency key makes concurrent/double runs harmless.
  const values: NewAlert[] = planned.map((p, i) => {
    const verdictShow = p.members.find((m) => m.show.verdict);
    return {
      showId: p.members[0].show.id,
      showIds: [...new Set(p.members.map((m) => m.show.id))],
      type: p.type,
      urgency: p.urgency,
      headline: copies[i].headline,
      body: copies[i].line,
      copyBy: copies[i].by,
      verdict: verdictShow && (p.type === "new_show" || p.type === "festival") ? verdictShow.show.verdict : null,
      isDemo: p.members.every((m) => m.show.source === "demo"),
      createdAt: now,
      idempotencyKey: idempotencyKey(p.subject, p.type, now),
    };
  });
  const inserted = values.length ? await db.insert(alerts).values(values).onConflictDoNothing().returning({ id: alerts.id, type: alerts.type }) : [];

  // 7. Email every unsent, non-info alert from the last 24h (retries earlier failures too).
  const { emailed, emailErrors } = await sendPendingEmails(now);

  const byType: Record<string, number> = {};
  for (const a of inserted) byType[a.type] = (byType[a.type] ?? 0) + 1;
  return {
    planned: planned.length,
    created: inserted.length,
    emailed,
    emailErrors,
    verdicts: verdictReqs.length,
    copyBy: { gemini: copies.filter((c) => c.by === "gemini").length, template: copies.filter((c) => c.by === "template").length },
    byType,
  };
}

async function sendPendingEmails(now: Date): Promise<{ emailed: number; emailErrors: number }> {
  const db = getDb();
  const env = getEnv();
  // Detector alerts always email; reminders only for shows Karan opted into (Remind me / Going).
  // A reminder created earlier gets emailed as soon as he taps Remind me (within 24h).
  const pending = await db
    .select({ a: alerts })
    .from(alerts)
    .innerJoin(shows, eq(shows.id, alerts.showId))
    .where(
      and(
        isNull(alerts.emailedAt),
        eq(alerts.isHistorical, false),
        ne(alerts.urgency, "info"),
        or(inArray(alerts.type, DETECTOR_LIST), and(inArray(alerts.type, REMINDER_LIST), inArray(shows.karanStatus, [...REMINDER_OPT_IN]))),
        lt(alerts.emailAttempts, MAX_EMAIL_ATTEMPTS),
        gt(alerts.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .orderBy(alerts.createdAt)
    .limit(25)
    .then((rows) => rows.map((r) => r.a));
  let emailed = 0;
  let emailErrors = 0;
  for (const a of pending) {
    // Claim the row so a concurrent scan can't send it too.
    const claimed = await db
      .update(alerts)
      .set({ emailClaimedAt: new Date(), emailAttempts: sql`${alerts.emailAttempts} + 1` })
      .where(and(eq(alerts.id, a.id), isNull(alerts.emailedAt), or(isNull(alerts.emailClaimedAt), lt(alerts.emailClaimedAt, new Date(Date.now() - 3 * 60_000)))))
      .returning({ id: alerts.id });
    if (claimed.length === 0) continue;

    const ids = a.showIds.length ? a.showIds : a.showId ? [a.showId] : [];
    const members = ids.length
      ? await db.select({ show: shows, artist: artists }).from(shows).innerJoin(artists, eq(artists.id, shows.artistId)).where(inArray(shows.id, ids))
      : [];
    const lead = members.find((m) => m.show.id === a.showId) ?? members[0];
    if (!lead) continue;
    const facts = buildFacts(lead.show, lead.artist, new Date());
    const verdictShow = members.find((m) => m.show.verdict && needsVerdict(m.show.city, m.artist.priority as Priority));
    const msg = renderEmail({
      headline: a.headline,
      line: a.body,
      urgency: a.urgency,
      facts,
      lineup: members.length > 1 ? members.map((m) => m.artist.name) : undefined,
      verdict:
        (a.type === "new_show" || a.type === "festival") && verdictShow?.show.verdict
          ? { verdict: verdictShow.show.verdict, reason: verdictShow.show.verdictReason ?? "" }
          : null,
      showUrl: `${env.APP_URL}/shows/${lead.show.id}`,
    });
    // Row id + key: blocks a true double-send, but a re-created alert (after a reset) is a new email.
    const res = await sendEmail({ ...msg, idempotencyKey: `alert-${a.id}:${a.idempotencyKey}` });
    if (!res.ok && isAlreadyAccepted(res.error)) {
      // Resend already accepted this exact alert on an earlier attempt: it is delivered.
      emailed++;
      await db.update(alerts).set({ emailedAt: new Date(), emailError: null }).where(eq(alerts.id, a.id));
    } else if (res.ok) {
      emailed++;
      await db.update(alerts).set({ emailedAt: new Date(), emailError: res.dryRun ? "dry run (logged, not sent)" : null }).where(eq(alerts.id, a.id));
    } else {
      emailErrors++;
      await db.update(alerts).set({ emailError: res.error.slice(0, 300), emailClaimedAt: null }).where(eq(alerts.id, a.id));
    }
    if (!res.ok || !res.dryRun) await new Promise((r) => setTimeout(r, EMAIL_SPACING_MS));
  }
  return { emailed, emailErrors };
}
