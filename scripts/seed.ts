/**
 * npm run seed — import data/artist.db (SQLite) into Postgres.
 * Re-runnable: reference tables are upserted, demo shows are reset, real shows only get
 * their simulated early-bird windows re-anchored to today. better-sqlite3 is used only here.
 */
import { config } from "dotenv";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { count, eq, inArray, notInArray } from "drizzle-orm";
import { createDb } from "../lib/db/connect";
import { alerts, appMeta, artists, seedTemplates, serpQueryPlan, serpRawEvents, shows, syncLog } from "../lib/db/schema";
import { applyShowTemplates, seedReference, type SeedData } from "../lib/seed/apply";

config({ path: process.env.ENV_FILE ?? ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (looked in .env.local or $ENV_FILE)");
  const sqlite = new Database(process.env.SEED_DB ?? "data/artist.db", { readonly: true, fileMustExist: true });
  const all = <T>(q: string) => sqlite.prepare(q).all() as T[];

  const data: SeedData = {
    artists: all("select * from artists order by artist_id"),
    profile: all("select key, value from karan_profile"),
    alertRules: all("select * from alert_rules"),
    ticketRules: all("select * from ticket_source_rules order by rule_order"),
    queryPlan: all("select * from serpapi_query_plan order by query_id"),
    knownShows: all("select * from known_shows order by show_id"),
    demoShows: all("select * from demo_shows order by show_id"),
  };
  sqlite.close();

  // Roster swaps: replace some festival-lineup artists with artists that have no India dates yet.
  type Swap = SeedData["artists"][number];
  const swaps: Swap[] = JSON.parse(readFileSync(process.env.SWAPS_FILE ?? "data/roster-swaps.json", "utf8")).swaps.map((x: Swap) => ({
    ...x,
    upcoming_india_cities: null,
    next_india_date: null,
  }));
  const swapIds = new Set(swaps.map((x) => x.artist_id));
  data.artists = data.artists.map((a) => swaps.find((x) => x.artist_id === a.artist_id) ?? a);
  data.knownShows = data.knownShows.filter((k) => !swapIds.has((k as { artist_id: string }).artist_id));

  const { db, close } = createDb(url);
  const started = new Date();
  try {
    await seedReference(db, data);
    // Clean up anything the swapped-out artists left behind, and set the new artists' priority.
    const ids = [...swapIds];
    if (ids.length) {
      const renamed = await db.select({ id: artists.id, name: artists.name }).from(artists).where(inArray(artists.id, ids));
      const stale = renamed.filter((r) => swaps.find((x) => x.artist_id === r.id)?.artist_name !== r.name).map((r) => r.id);
      for (const x of swaps) await db.update(artists).set({ name: x.artist_name, priority: x.priority, upcomingIndiaCities: null, nextIndiaDate: null }).where(eq(artists.id, x.artist_id));
      await db.delete(shows).where(inArray(shows.artistId, ids));
      await db.update(serpRawEvents).set({ matchedArtistId: null, showId: null, matchMethod: "none", matchConfidence: null }).where(inArray(serpRawEvents.matchedArtistId, ids));
      if (stale.length) console.log(`Swapped ${stale.length} artists into the roster`);
    }
    const keep = [...data.knownShows, ...data.demoShows].map((r) => (r as { show_id: string }).show_id);
    await db.delete(seedTemplates).where(notInArray(seedTemplates.seedId, keep));
    const res = await applyShowTemplates(db, started);
    await db
      .insert(appMeta)
      .values({ key: "last_reset_at", value: started.toISOString() })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: started.toISOString(), updatedAt: started } });
    await db.insert(syncLog).values({
      kind: "reset",
      trigger: "seed",
      startedAt: started,
      finishedAt: new Date(),
      description: `Seed from artist.db: ${data.artists.length} artists, ${res.known} known, ${res.demo} demo shows`,
      resultsCount: res.known + res.demo,
      alertsCreated: res.historicalAlerts,
    });

    const [a] = await db.select({ n: count() }).from(artists);
    const [k] = await db.select({ n: count() }).from(shows).where(eq(shows.source, "known"));
    const [d] = await db.select({ n: count() }).from(shows).where(eq(shows.source, "demo"));
    const [q] = await db.select({ n: count() }).from(serpQueryPlan);
    const [h] = await db.select({ n: count() }).from(alerts).where(eq(alerts.isHistorical, true));
    console.log(`Seeded ✔  artists=${a.n} (expect 60)  real=${k.n} (known; more may be confirmed by live search)  sample=${d.n}  query_plan=${q.n}  historical_alerts=${h.n}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
