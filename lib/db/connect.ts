import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = NeonHttpDatabase<typeof schema>;

/**
 * Neon (production) uses the HTTP driver — ideal for serverless. Any other Postgres URL
 * (local development) uses postgres-js. Both expose the same Drizzle query builder; the
 * app never relies on driver-specific features (no interactive transactions, no batch).
 */
export function createDb(url: string): { db: DB; close: () => Promise<void> } {
  if (/neon\.tech|neon\.build/.test(url)) {
    return { db: drizzleNeon(neon(url), { schema }), close: async () => {} };
  }
  const client = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  return { db: drizzlePg(client, { schema }) as unknown as DB, close: () => client.end() };
}
