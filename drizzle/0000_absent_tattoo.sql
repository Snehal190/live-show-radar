CREATE TABLE "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"priority" text NOT NULL,
	"sends_alert" boolean NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" integer,
	"show_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"type" text NOT NULL,
	"urgency" text NOT NULL,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"copy_by" text DEFAULT 'template' NOT NULL,
	"verdict" text,
	"is_historical" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	"email_attempts" integer DEFAULT 0 NOT NULL,
	"email_error" text,
	"read_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "alerts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"origin" text,
	"country" text,
	"genre" text,
	"priority" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"upcoming_india_cities" text,
	"next_india_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artists_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "karan_profile" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rumours" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" text,
	"claim" text NOT NULL,
	"city" text,
	"date_text" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_templates" (
	"seed_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serp_query_plan" (
	"query_id" text PRIMARY KEY NOT NULL,
	"cadence" text NOT NULL,
	"engine" text NOT NULL,
	"q" text NOT NULL,
	"gl" text NOT NULL,
	"hl" text NOT NULL,
	"start" integer DEFAULT 0 NOT NULL,
	"purpose" text,
	"searches_per_month" integer,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "serp_raw_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_log_id" integer,
	"query_id" text,
	"query" text,
	"city" text,
	"page" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"parsed_city" text,
	"parsed_starts_at" timestamp with time zone,
	"matched_artist_id" text,
	"match_confidence" real,
	"match_method" text DEFAULT 'none' NOT NULL,
	"show_id" integer,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" serial PRIMARY KEY NOT NULL,
	"seed_id" text,
	"artist_id" text NOT NULL,
	"event_name" text NOT NULL,
	"event_type" text NOT NULL,
	"city" text NOT NULL,
	"venue" text,
	"starts_at" timestamp with time zone NOT NULL,
	"time_known" boolean DEFAULT false NOT NULL,
	"date_label" text,
	"source" text NOT NULL,
	"source_url" text,
	"ticket_platform" text,
	"serp_ticket_source" text,
	"serp_ticket_url" text,
	"serp_fetched_at" timestamp with time zone,
	"announced_at" timestamp with time zone NOT NULL,
	"eb_source" text DEFAULT 'unknown' NOT NULL,
	"eb_opens_at" timestamp with time zone,
	"eb_closes_at" timestamp with time zone,
	"eb_price_inr" integer,
	"general_price_inr" integer,
	"eb_status_override" text,
	"general_status" text,
	"eb_sold_out_at" timestamp with time zone,
	"general_sold_out_at" timestamp with time zone,
	"karan_status" text,
	"booked_tier" text,
	"status_changed_at" timestamp with time zone,
	"is_daily_drop" boolean DEFAULT false NOT NULL,
	"scenario" text,
	"verdict" text,
	"verdict_reason" text,
	"verdict_by" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shows_seed_id_unique" UNIQUE("seed_id"),
	CONSTRAINT "shows_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"trigger" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"description" text,
	"query_id" text,
	"city" text,
	"page" integer,
	"results_count" integer DEFAULT 0 NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"new_shows_count" integer DEFAULT 0 NOT NULL,
	"alerts_created" integer DEFAULT 0 NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"searches_used" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ticket_source_rules" (
	"rule_order" integer PRIMARY KEY NOT NULL,
	"rule" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rumours" ADD CONSTRAINT "rumours_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shows" ADD CONSTRAINT "shows_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_show_idx" ON "alerts" USING btree ("show_id");--> statement-breakpoint
CREATE INDEX "alerts_created_idx" ON "alerts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rumours_dedupe_idx" ON "rumours" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "serp_raw_fetched_idx" ON "serp_raw_events" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "shows_artist_city_idx" ON "shows" USING btree ("artist_id","city");--> statement-breakpoint
CREATE INDEX "shows_starts_idx" ON "shows" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "sync_log_started_idx" ON "sync_log" USING btree ("started_at");