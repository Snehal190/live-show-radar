// Local development database: a real Postgres (via embedded-postgres) on port 54330.
// Production uses Neon. Run: node scripts/dev-db.mjs
import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({ databaseDir: ".localdb/pg", user: "postgres", password: "postgres", port: 54330, persistent: true });
import { existsSync } from "node:fs";
if (!existsSync(".localdb/pg/PG_VERSION")) await pg.initialise();
await pg.start();
console.log("Local Postgres ready on postgres://postgres:postgres@127.0.0.1:54330/postgres");
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
