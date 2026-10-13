import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ───────────────────────── Seed mirrors ─────────────────────────

export const artists = pgTable("artists", {
  id: text("id").primaryKey(), // A001 … A060 (artist_id from artist.db)
  name: text("name").notNull().unique(),
  origin: text("origin"),
  country: text("country"),
  genre: text("genre"),
  priority: text("priority", { enum: ["Must-see", "Like"] }).notNull(),
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  upcomingIndiaCities: text("upcoming_india_cities"),
  nextIndiaDate: date("next_india_date"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(), // '*' = any other city
  priority: text("priority").notNull(), // '*' = any priority
  sendsAlert: boolean("sends_alert").notNull(),
  note: text("note"),
});

export const ticketSourceRules = pgTable("ticket_source_rules", {
  ruleOrder: integer("rule_order").primaryKey(),
  rule: text("rule").notNull(),
});

export const karanProfile = pgTable("karan_profile", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const serpQueryPlan = pgTable("serp_query_plan", {
  queryId: text("query_id").primaryKey(),
  cadence: text("cadence", { enum: ["daily", "weekly", "monthly"] }).notNull(),
  engine: text("engine").notNull(),
  q: text("q").notNull(),
  gl: text("gl").notNull(),
  hl: text("hl").notNull(),
  start: integer("start").notNull().default(0),
  purpose: text("purpose"),
  searchesPerMonth: integer("searches_per_month"),
  lastRunAt: ts("last_run_at"),
});

/** Raw known_shows / demo_shows rows (with their day offsets) so the daily reset can re-anchor them. */
export const seedTemplates = pgTable("seed_templates", {
  seedId: text("seed_id").primaryKey(), // K001 / D001
  kind: text("kind", { enum: ["known", "demo"] }).notNull(),
  data: jsonb("data").notNull(),
});

// ───────────────────────── Core ─────────────────────────

export const shows = pgTable(
  "shows",
  {
    id: serial("id").primaryKey(),
    seedId: text("seed_id").unique(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    eventName: text("event_name").notNull(),
    eventType: text("event_type", { enum: ["Concert", "Festival"] }).notNull(),
    city: text("city").notNull(),
    venue: text("venue"),
    startsAt: ts("starts_at").notNull(),
    timeKnown: boolean("time_known").notNull().default(false),
    dateLabel: text("date_label"),
    source: text("source", { enum: ["serpapi", "gemini_web", "known", "demo"] }).notNull(),
    sourceUrl: text("source_url"),
    ticketPlatform: text("ticket_platform"), // from known_shows / Gemini
    serpTicketSource: text("serp_ticket_source"), // ticket_info[].source from SerpApi
    serpTicketUrl: text("serp_ticket_url"), // ticket_info[].link from SerpApi
    serpFetchedAt: ts("serp_fetched_at"),
    announcedAt: ts("announced_at").notNull(),
    ebSource: text("eb_source", { enum: ["real", "simulated", "unknown", "demo"] }).notNull().default("unknown"),
    ebOpensAt: ts("eb_opens_at"),
    ebClosesAt: ts("eb_closes_at"),
    ebPriceInr: integer("eb_price_inr"),
    generalPriceInr: integer("general_price_inr"),
    ebStatusOverride: text("eb_status_override"), // 'Sold out' | null
    generalStatus: text("general_status"), // 'On sale' | 'Sold out' | 'Not yet on sale' | null
    ebSoldOutAt: ts("eb_sold_out_at"), // set when a sync observes the change → Detector alert
    generalSoldOutAt: ts("general_sold_out_at"),
    karanStatus: text("karan_status", { enum: ["going", "interested", "skipped"] }),
    bookedTier: text("booked_tier", { enum: ["early_bird", "general"] }),
    statusChangedAt: ts("status_changed_at"),
    isDailyDrop: boolean("is_daily_drop").notNull().default(false),
    scenario: text("scenario"),
    verdict: text("verdict", { enum: ["go", "think", "skip"] }),
    verdictReason: text("verdict_reason"),
    verdictBy: text("verdict_by", { enum: ["gemini", "rules"] }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("shows_artist_city_idx").on(t.artistId, t.city), index("shows_starts_idx").on(t.startsAt)],
);

export const serpRawEvents = pgTable(
  "serp_raw_events",
  {
    id: serial("id").primaryKey(),
    syncLogId: integer("sync_log_id"),
    queryId: text("query_id"),
    query: text("query"),
    city: text("city"),
    page: integer("page").notNull().default(0),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    title: text("title").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    parsedCity: text("parsed_city"),
    parsedStartsAt: ts("parsed_starts_at"),
    matchedArtistId: text("matched_artist_id"),
    matchConfidence: real("match_confidence"),
    matchMethod: text("match_method", { enum: ["alias", "gemini", "none"] }).notNull().default("none"),
    showId: integer("show_id"),
    skipReason: text("skip_reason"),
  },
  (t) => [index("serp_raw_fetched_idx").on(t.fetchedAt)],
);

export const syncLog = pgTable(
  "sync_log",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["serpapi", "gemini_web", "gemini", "scan", "reset", "email"] }).notNull(),
    trigger: text("trigger"), // cron | manual | catchup | seed | self-heal
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    description: text("description"),
    queryId: text("query_id"),
    city: text("city"),
    page: integer("page"),
    resultsCount: integer("results_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    newShowsCount: integer("new_shows_count").notNull().default(0),
    alertsCreated: integer("alerts_created").notNull().default(0),
    emailsSent: integer("emails_sent").notNull().default(0),
    searchesUsed: integer("searches_used").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("sync_log_started_idx").on(t.startedAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    showId: integer("show_id").references(() => shows.id, { onDelete: "cascade" }),
    showIds: integer("show_ids").array().notNull().default(sql`'{}'::int[]`), // festival alerts list every show
    type: text("type", {
      enum: [
        "new_show",
        "festival",
        "eb_sold_out",
        "general_sold_out",
        "eb_live",
        "eb_closing",
        "decide_soon",
        "show_week",
        "tonight",
        "missed",
        "nudge",
      ],
    }).notNull(),
    urgency: text("urgency", { enum: ["critical", "high", "medium", "low", "info"] }).notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    copyBy: text("copy_by", { enum: ["gemini", "template"] }).notNull().default("template"),
    verdict: text("verdict"),
    isHistorical: boolean("is_historical").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    emailedAt: ts("emailed_at"),
    emailClaimedAt: ts("email_claimed_at"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailError: text("email_error"),
    readAt: ts("read_at"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
  },
  (t) => [index("alerts_show_idx").on(t.showId), index("alerts_created_idx").on(t.createdAt)],
);

export const rumours = pgTable(
  "rumours",
  {
    id: serial("id").primaryKey(),
    artistId: text("artist_id").references(() => artists.id),
    claim: text("claim").notNull(),
    city: text("city"),
    dateText: text("date_text"),
    reason: text("reason").notNull(), // why it was not trusted
    createdAt: ts("created_at").notNull().defaultNow(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [uniqueIndex("rumours_dedupe_idx").on(t.dedupeKey)],
);

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Fixed-window counters for public writes (status buttons) and the global Sync-now limiter. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull().defaultNow(),
});

export type Show = typeof shows.$inferSelect;
export type NewShow = typeof shows.$inferInsert;
export type Artist = typeof artists.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertType = Alert["type"];
export type Urgency = Alert["urgency"];
export type SyncLog = typeof syncLog.$inferSelect;
export type SerpRawEvent = typeof serpRawEvents.$inferSelect;
