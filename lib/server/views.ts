import "server-only";
import { and, arrayContains, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { earlyBirdLine, showDateText } from "@/lib/alerts/facts";
import { getDb } from "@/lib/db";
import { alertRules, alerts, artists, rumours, serpRawEvents, shows, syncLog, type Alert, type Artist, type Show } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { chooseTicketSource, ebState, isAlertable, isMissed, type EbState, type Priority, type TicketChoice } from "@/lib/logic/rules";
import { getMeta } from "@/lib/server/meta";

export interface ShowView {
  id: number;
  artistId: string;
  artist: string;
  priority: Priority;
  genre: string | null;
  eventName: string;
  eventType: "Concert" | "Festival";
  city: string;
  venue: string | null;
  startsAt: string;
  timeKnown: boolean;
  dateText: string;
  announcedAt: string;
  source: Show["source"];
  sourceUrl: string | null;
  serpFetchedAt: string | null;
  ebSource: Show["ebSource"];
  ebState: EbState;
  ebLine: string;
  ebUrgent: boolean;
  ebOpensAt: string | null;
  ebClosesAt: string | null;
  ebPriceInr: number | null;
  generalPriceInr: number | null;
  generalStatus: string | null;
  karanStatus: Show["karanStatus"];
  bookedTier: Show["bookedTier"];
  statusChangedAt: string | null;
  isDailyDrop: boolean;
  scenario: string | null;
  verdict: Show["verdict"];
  verdictReason: string | null;
  verdictBy: Show["verdictBy"];
  ticket: TicketChoice;
  alertable: boolean;
  missed: boolean;
  past: boolean;
}

export interface AlertView {
  id: number;
  showId: number | null;
  showIds: number[];
  type: Alert["type"];
  urgency: Alert["urgency"];
  headline: string;
  body: string;
  copyBy: Alert["copyBy"];
  verdict: string | null;
  isHistorical: boolean;
  isDemo: boolean;
  createdAt: string;
  emailedAt: string | null;
  emailError: string | null;
  readAt: string | null;
  artists: string[];
  city: string | null;
  showStatus: Show["karanStatus"];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toShowView(show: Show, artist: Pick<Artist, "name" | "priority" | "genre">, alertable: boolean, now: Date): ShowView {
  const eb = earlyBirdLine(show, now);
  return {
    id: show.id,
    artistId: show.artistId,
    artist: artist.name,
    priority: artist.priority as Priority,
    genre: artist.genre,
    eventName: show.eventName,
    eventType: show.eventType,
    city: show.city,
    venue: show.venue && show.venue !== "TBA" ? show.venue : null,
    startsAt: show.startsAt.toISOString(),
    timeKnown: show.timeKnown,
    dateText: showDateText(show),
    announcedAt: show.announcedAt.toISOString(),
    source: show.source,
    sourceUrl: show.sourceUrl,
    serpFetchedAt: iso(show.serpFetchedAt),
    ebSource: show.ebSource,
    ebState: ebState(show, now),
    ebLine: eb.text,
    ebUrgent: eb.urgent,
    ebOpensAt: iso(show.ebOpensAt),
    ebClosesAt: iso(show.ebClosesAt),
    ebPriceInr: show.ebPriceInr,
    generalPriceInr: show.generalPriceInr,
    generalStatus: show.generalStatus,
    karanStatus: show.karanStatus,
    bookedTier: show.bookedTier,
    statusChangedAt: iso(show.statusChangedAt),
    isDailyDrop: show.isDailyDrop,
    scenario: show.scenario,
    verdict: show.verdict,
    verdictReason: show.verdictReason,
    verdictBy: show.verdictBy,
    ticket: chooseTicketSource(show),
    alertable,
    missed: alertable && isMissed(show, now),
    past: show.startsAt < now,
  };
}

/** Karan's radar: the three cities he travels for. Other cities are kept in the DB but not shown. */
export const FOCUS_CITIES = ["Bengaluru", "Mumbai", "Chennai"] as const;

/** Every announced show in Karan's cities (future announcements, e.g. the 17:00 drop at 14:00, stay hidden). */
export async function getShowViews(now = new Date()): Promise<ShowView[]> {
  const db = getDb();
  const [rows, rules] = await Promise.all([
    db.select({ show: shows, artist: artists }).from(shows).innerJoin(artists, eq(artists.id, shows.artistId)).where(lte(shows.announcedAt, now)),
    db.select().from(alertRules),
  ]);
  return rows
    .filter((r) => (FOCUS_CITIES as readonly string[]).includes(r.show.city))
    .map((r) => toShowView(r.show, r.artist, isAlertable(r.show, r.artist.priority as Priority, rules), now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function getShowView(id: number, now = new Date()): Promise<{ view: ShowView; alerts: AlertView[] } | null> {
  const db = getDb();
  const [row] = await db.select({ show: shows, artist: artists }).from(shows).innerJoin(artists, eq(artists.id, shows.artistId)).where(eq(shows.id, id));
  if (!row || row.show.announcedAt > now) return null;
  const rules = await db.select().from(alertRules);
  const history = await db
    .select()
    .from(alerts)
    .where(or(eq(alerts.showId, id), arrayContains(alerts.showIds, [id])))
    .orderBy(desc(alerts.createdAt));
  return {
    view: toShowView(row.show, row.artist, isAlertable(row.show, row.artist.priority as Priority, rules), now),
    alerts: await decorateAlerts(history),
  };
}

async function decorateAlerts(list: Alert[]): Promise<AlertView[]> {
  const ids = [...new Set(list.flatMap((a) => [...(a.showId ? [a.showId] : []), ...a.showIds]))];
  const rows = ids.length
    ? await getDb().select({ id: shows.id, city: shows.city, artist: artists.name, karanStatus: shows.karanStatus }).from(shows).innerJoin(artists, eq(artists.id, shows.artistId)).where(inArray(shows.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return list.map((a) => {
    const members = (a.showIds.length ? a.showIds : a.showId ? [a.showId] : []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    return {
      id: a.id,
      showId: a.showId,
      showIds: a.showIds,
      type: a.type,
      urgency: a.urgency,
      headline: a.headline,
      body: a.body,
      copyBy: a.copyBy,
      verdict: a.verdict,
      isHistorical: a.isHistorical,
      isDemo: a.isDemo,
      createdAt: a.createdAt.toISOString(),
      emailedAt: iso(a.emailedAt),
      emailError: a.emailError,
      readAt: iso(a.readAt),
      artists: [...new Set(members.map((m) => m.artist))],
      city: members[0]?.city ?? null,
      showStatus: (a.showId ? byId.get(a.showId)?.karanStatus : members[0]?.karanStatus) ?? null,
    };
  });
}

export async function getAlertViews(limit = 300): Promise<AlertView[]> {
  const list = await getDb().select().from(alerts).orderBy(desc(alerts.createdAt)).limit(limit);
  return decorateAlerts(list);
}

export async function unreadAlertCount(): Promise<number> {
  const rows = await getDb().select({ id: alerts.id }).from(alerts).where(isNull(alerts.readAt));
  return rows.length;
}

export async function getStatus() {
  const env = getEnv();
  const m = await getMeta(["last_scan_at", "last_serp_sync_at", "last_web_scan_at", "last_reset_at", "serp_searches_this_month", "last_manual_sync_at"]);
  return {
    lastScanAt: m.last_scan_at || null,
    lastSerpSyncAt: m.last_serp_sync_at || null,
    lastWebScanAt: m.last_web_scan_at || null,
    lastResetAt: m.last_reset_at || null,
    lastManualSyncAt: m.last_manual_sync_at || null,
    quotaUsed: Number(m.serp_searches_this_month ?? 0),
    quotaLimit: env.SERPAPI_MONTHLY_QUOTA,
  };
}

export async function getLiveFeed() {
  const db = getDb();
  const [logs, raw, unmatched, rumourRows] = await Promise.all([
    db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(120),
    db.select().from(serpRawEvents).orderBy(desc(serpRawEvents.fetchedAt), desc(serpRawEvents.id)).limit(80),
    db
      .select()
      .from(serpRawEvents)
      .where(and(eq(serpRawEvents.matchMethod, "none"), isNull(serpRawEvents.skipReason)))
      .orderBy(desc(serpRawEvents.fetchedAt))
      .limit(60),
    db.select({ r: rumours, artist: artists.name }).from(rumours).leftJoin(artists, eq(artists.id, rumours.artistId)).orderBy(desc(rumours.createdAt)).limit(40),
  ]);
  const showIds = [...new Set(raw.map((r) => r.showId).filter((x): x is number => x !== null))];
  const matchedShows = showIds.length
    ? await db.select({ id: shows.id, eventName: shows.eventName, city: shows.city, startsAt: shows.startsAt, artist: artists.name }).from(shows).innerJoin(artists, eq(artists.id, shows.artistId)).where(inArray(shows.id, showIds))
    : [];
  return {
    logs: logs.map((l) => ({ ...l, startedAt: l.startedAt.toISOString(), finishedAt: iso(l.finishedAt) })),
    raw: raw.map((r) => ({ ...r, fetchedAt: r.fetchedAt.toISOString(), parsedStartsAt: iso(r.parsedStartsAt) })),
    unmatched: unmatched.map((r) => ({ id: r.id, title: r.title, city: r.parsedCity, startsAt: iso(r.parsedStartsAt), fetchedAt: r.fetchedAt.toISOString(), confidence: r.matchConfidence })),
    rumours: rumourRows.map(({ r, artist }) => ({ id: r.id, artist, claim: r.claim, city: r.city, dateText: r.dateText, reason: r.reason, createdAt: r.createdAt.toISOString() })),
    matchedShows: matchedShows.map((s) => ({ ...s, startsAt: s.startsAt.toISOString() })),
  };
}

export async function getArtistsWithShows(now = new Date()) {
  const [list, views] = await Promise.all([getDb().select().from(artists).orderBy(artists.name), getShowViews(now)]);
  return list.map((a) => {
    const upcoming = views.filter((v) => v.artistId === a.id && !v.past);
    return {
      id: a.id,
      name: a.name,
      priority: a.priority as Priority,
      genre: a.genre,
      origin: a.origin,
      country: a.country,
      cities: upcoming.length ? [...new Set(upcoming.map((v) => v.city))] : (a.upcomingIndiaCities ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      nextShow: upcoming[0] ? { id: upcoming[0].id, dateText: upcoming[0].dateText, city: upcoming[0].city } : null,
      nextIndiaDate: a.nextIndiaDate,
      showCount: upcoming.length,
    };
  });
}

/** Today's 13/15/17/19/21 demo drops. Artists stay hidden until each drop time. */
export async function getTodayDrops(now = new Date()) {
  const rows = await getDb()
    .select({ id: shows.id, announcedAt: shows.announcedAt, artist: artists.name, city: shows.city })
    .from(shows)
    .innerJoin(artists, eq(artists.id, shows.artistId))
    .where(eq(shows.isDailyDrop, true))
    .orderBy(shows.announcedAt);
  return rows.map((r) => {
    const dropped = r.announcedAt <= now;
    return { id: dropped ? r.id : null, at: r.announcedAt.toISOString(), dropped, artist: dropped ? r.artist : null, city: dropped ? r.city : null };
  });
}
