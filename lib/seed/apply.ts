import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { templateCopy } from "@/lib/alerts/templates";
import type { DB } from "@/lib/db/connect";
import { alertRules, alerts, appMeta, artists, karanProfile, seedTemplates, serpQueryPlan, shows, ticketSourceRules } from "@/lib/db/schema";
import { groupFestivalAnnouncements, isAlertable, newShowUrgency, type Priority, type ShowFacts } from "@/lib/logic/rules";
import { anchorDemo, anchorKnown, DemoShowRow, KnownShowRow, type AnchoredShow } from "./anchor";

export interface SeedData {
  artists: {
    artist_id: string;
    artist_name: string;
    origin: string | null;
    country: string | null;
    genre: string | null;
    priority: "Must-see" | "Like";
    search_aliases: string | null;
    upcoming_india_cities: string | null;
    next_india_date: string | null;
  }[];
  profile: { key: string; value: string }[];
  alertRules: { city: string; priority: string; sends_alert: number; note: string | null }[];
  ticketRules: { rule_order: number; rule: string }[];
  queryPlan: {
    query_id: string;
    cadence: "daily" | "weekly" | "monthly";
    engine: string;
    q: string;
    gl: string;
    hl: string;
    start: number;
    purpose: string | null;
    searches_per_month: number | null;
  }[];
  knownShows: unknown[];
  demoShows: unknown[];
}

const ex = (col: string) => sql.raw(`excluded."${col}"`);

/** Reference tables. Re-runnable: upserts, and never overwrites Karan's priority toggles. */
export async function seedReference(db: DB, d: SeedData): Promise<void> {
  await db
    .insert(artists)
    .values(
      d.artists.map((a) => ({
        id: a.artist_id,
        name: a.artist_name,
        origin: a.origin,
        country: a.country,
        genre: a.genre,
        priority: a.priority,
        aliases: (a.search_aliases ?? "").split("|").map((s) => s.trim()).filter(Boolean),
        upcomingIndiaCities: a.upcoming_india_cities,
        nextIndiaDate: a.next_india_date || null,
      })),
    )
    .onConflictDoUpdate({
      target: artists.id,
      set: {
        name: ex("name"),
        origin: ex("origin"),
        country: ex("country"),
        genre: ex("genre"),
        aliases: ex("aliases"),
        upcomingIndiaCities: ex("upcoming_india_cities"),
        nextIndiaDate: ex("next_india_date"),
      },
    });

  await db.delete(alertRules);
  await db.insert(alertRules).values(d.alertRules.map((r) => ({ city: r.city, priority: r.priority, sendsAlert: r.sends_alert === 1, note: r.note })));
  await db.delete(ticketSourceRules);
  await db.insert(ticketSourceRules).values(d.ticketRules.map((r) => ({ ruleOrder: r.rule_order, rule: r.rule })));
  await db
    .insert(karanProfile)
    .values(d.profile.map((p) => ({ key: p.key, value: p.value })))
    .onConflictDoUpdate({ target: karanProfile.key, set: { value: ex("value") } });
  // Karan's radar covers Bengaluru, Mumbai and Chennai; Delhi queries are not run, and page 3
  // is skipped (Google Events returns ~25 events per page, so pages 1–2 cover the horizon).
  const plan = d.queryPlan.filter((q) => !/\bdelhi\b/i.test(q.q) && q.start < 20);
  await db.delete(serpQueryPlan).where(notInArray(serpQueryPlan.queryId, plan.map((q) => q.query_id)));
  await db
    .insert(serpQueryPlan)
    .values(
      plan.map((q) => ({
        queryId: q.query_id,
        cadence: q.cadence,
        engine: q.engine,
        q: q.q,
        gl: q.gl,
        hl: q.hl,
        start: q.start,
        purpose: q.purpose,
        searchesPerMonth: q.searches_per_month,
      })),
    )
    .onConflictDoUpdate({
      target: serpQueryPlan.queryId,
      set: { cadence: ex("cadence"), engine: ex("engine"), q: ex("q"), gl: ex("gl"), hl: ex("hl"), start: ex("start"), purpose: ex("purpose"), searchesPerMonth: ex("searches_per_month") },
    });

  // Validate now so a malformed artist.db fails the seed, not the 00:05 reset.
  const templates = [
    ...d.knownShows.map((r) => ({ seedId: KnownShowRow.parse(r).show_id, kind: "known" as const, data: r })),
    ...d.demoShows.map((r) => ({ seedId: DemoShowRow.parse(r).show_id, kind: "demo" as const, data: r })),
  ];
  await db.insert(seedTemplates).values(templates).onConflictDoUpdate({ target: seedTemplates.seedId, set: { kind: ex("kind"), data: ex("data") } });

  await db
    .insert(appMeta)
    .values([
      { key: "serp_searches_this_month", value: "0" },
      { key: "serp_quota_month", value: "" },
      { key: "web_scan_cursor", value: "0" },
    ])
    .onConflictDoNothing();
}

function toRow(a: AnchoredShow) {
  const { seedAsAlreadyAlerted: _ignored, ...row } = a;
  void _ignored;
  return row;
}

export interface ApplyResult {
  known: number;
  demo: number;
  historicalAlerts: number;
}

/**
 * Anchor show templates to `now` (used by `npm run seed` and the 00:05 IST reset).
 *  - Known shows are inserted once; afterwards only their simulated early-bird windows are
 *    re-anchored. Real data (serpapi / gemini_web merges, Karan's choices on real shows) is untouched.
 *  - Demo shows are fully reset, including statuses and their alert history, so the
 *    13/15/17/19/21 drops replay.
 */
export async function applyShowTemplates(db: DB, now: Date): Promise<ApplyResult> {
  const templates = await db.select().from(seedTemplates);
  const known = templates.filter((t) => t.kind === "known").map((t) => anchorKnown(KnownShowRow.parse(t.data), now));
  const demo = templates.filter((t) => t.kind === "demo").map((t) => anchorDemo(DemoShowRow.parse(t.data), now));

  if (known.length > 0) {
    await db
      .insert(shows)
      .values(known.map(toRow))
      .onConflictDoUpdate({
        target: shows.seedId,
        // Only the simulated early-bird is re-anchored; every real fact and Karan's choices stay.
        set: {
          ebSource: sql`case when ${shows.ebSource} in ('simulated','unknown') then excluded."eb_source" else ${shows.ebSource} end`,
          ebOpensAt: sql`case when excluded."eb_source" = 'simulated' then excluded."eb_opens_at" else ${shows.ebOpensAt} end`,
          ebClosesAt: sql`case when excluded."eb_source" = 'simulated' then excluded."eb_closes_at" else ${shows.ebClosesAt} end`,
          ebPriceInr: sql`case when excluded."eb_source" = 'simulated' then excluded."eb_price_inr" else ${shows.ebPriceInr} end`,
          ebStatusOverride: sql`case when excluded."eb_source" = 'simulated' then excluded."eb_status_override" else ${shows.ebStatusOverride} end`,
          scenario: ex("scenario"),
          updatedAt: now,
        },
      });
  }

  if (demo.length > 0) {
    const demoIds = (await db.select({ id: shows.id }).from(shows).where(eq(shows.source, "demo"))).map((r) => r.id);
    if (demoIds.length > 0) await db.delete(alerts).where(and(eq(alerts.isDemo, true)));
    const set: Record<string, unknown> = {};
    for (const col of [
      "artist_id", "event_name", "event_type", "city", "venue", "starts_at", "time_known", "date_label", "source_url",
      "ticket_platform", "announced_at", "eb_source", "eb_opens_at", "eb_closes_at", "eb_price_inr", "general_price_inr",
      "eb_status_override", "general_status", "karan_status", "booked_tier", "status_changed_at", "is_daily_drop", "scenario",
    ]) {
      set[col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = ex(col);
    }
    await db
      .insert(shows)
      .values(demo.map(toRow))
      .onConflictDoUpdate({
        target: shows.seedId,
        set: { ...set, source: sql`'demo'`, ebSoldOutAt: null, generalSoldOutAt: null, verdict: null, verdictReason: null, verdictBy: null, updatedAt: now },
      });
  }

  const historicalAlerts = await insertHistoricalAlerts(db, [...known, ...demo].filter((s) => s.seedAsAlreadyAlerted).map((s) => s.seedId));
  return { known: known.length, demo: demo.length, historicalAlerts };
}

/** "Already alerted" history so the first scan does not flood the inbox. Reminders still fire. */
async function insertHistoricalAlerts(db: DB, seedIds: string[]): Promise<number> {
  if (seedIds.length === 0) return 0;
  const rows = await db
    .select({ show: shows, artistName: artists.name, priority: artists.priority })
    .from(shows)
    .innerJoin(artists, eq(artists.id, shows.artistId))
    .where(inArray(shows.seedId, seedIds));
  const rules = await db.select().from(alertRules);
  const announced = new Set(
    (await db.select({ showId: alerts.showId, showIds: alerts.showIds }).from(alerts).where(inArray(alerts.type, ["new_show", "festival"]))).flatMap((a) => [
      ...(a.showId ? [a.showId] : []),
      ...a.showIds,
    ]),
  );
  const byId = new Map(rows.map((r) => [r.show.id, r]));
  const candidates = rows.filter((r) => !announced.has(r.show.id) && isAlertable(r.show, r.priority as Priority, rules)).map((r) => r.show as ShowFacts & typeof r.show);
  const allFestival = rows.map((r) => r.show).filter((s) => s.eventType === "Festival");
  const { festivals, singles } = groupFestivalAnnouncements(candidates, allFestival);

  const values: (typeof alerts.$inferInsert)[] = [];
  for (const s of singles) {
    const r = byId.get(s.id);
    if (!r) continue;
    const urgency = newShowUrgency(s, r.priority as Priority, s.announcedAt);
    const copy = templateCopy({ type: "new_show", urgency, artist: r.artistName, priority: r.priority as Priority, city: s.city });
    values.push({
      showId: s.id,
      showIds: [s.id],
      type: "new_show",
      urgency,
      headline: copy.headline,
      body: copy.line,
      isHistorical: true,
      isDemo: s.source === "demo",
      createdAt: s.announcedAt,
      emailedAt: s.announcedAt,
      readAt: s.announcedAt,
      idempotencyKey: `${s.id}:new_show:hist`,
    });
  }
  for (const f of festivals) {
    const members = f.shows.map((s) => byId.get(s.id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const first = members[0].show;
    const names = members.map((m) => m.artistName);
    const copy = templateCopy({
      type: "festival",
      urgency: "high",
      artist: names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", "),
      priority: "Like",
      city: first.city,
      festivalName: first.eventName.replace(/\s*\([^()]*\)\s*$/, ""),
      artistCount: names.length,
    });
    const createdAt = new Date(Math.min(...members.map((m) => m.show.announcedAt.getTime())));
    values.push({
      showId: first.id,
      showIds: members.map((m) => m.show.id),
      type: "festival",
      urgency: members.some((m) => m.show.city === "Bengaluru" && m.priority === "Must-see") ? "critical" : "high",
      headline: copy.headline,
      body: copy.line,
      isHistorical: true,
      isDemo: first.source === "demo",
      createdAt,
      emailedAt: createdAt,
      readAt: createdAt,
      idempotencyKey: `fest-${f.key}:festival:hist`,
    });
  }
  if (values.length === 0) return 0;
  const inserted = await db.insert(alerts).values(values).onConflictDoNothing().returning({ id: alerts.id });
  return inserted.length;
}
