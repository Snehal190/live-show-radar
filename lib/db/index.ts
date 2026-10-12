import "server-only";
import { getEnv } from "@/lib/env";
import { createDb, type DB } from "./connect";
import * as schema from "./schema";

let instance: DB | undefined;

export function getDb(): DB {
  instance ??= createDb(getEnv().DATABASE_URL).db;
  return instance;
}

export type { DB };
export { schema };
