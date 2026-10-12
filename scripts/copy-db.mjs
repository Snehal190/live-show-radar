// One-off helper: copy every table from the local dev database to another Postgres (e.g. Neon).
// Usage: TARGET_URL=postgres://... node scripts/copy-db.mjs   (source = DATABASE_URL in .env.local)
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });

const src = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const dst = postgres(process.env.TARGET_URL, { max: 1, ssl: "require", onnotice: () => {} });

// Parent tables first (foreign keys).
const TABLES = ["artists", "alert_rules", "ticket_source_rules", "karan_profile", "serp_query_plan", "seed_templates", "app_meta", "shows", "alerts", "serp_raw_events", "sync_log", "rumours"];

await dst.unsafe(`truncate ${[...TABLES].reverse().join(", ")} restart identity cascade`);
for (const t of TABLES) {
  const rows = await src.unsafe(`select * from ${t}`);
  const jsonCols = (await src.unsafe(`select column_name from information_schema.columns where table_name = '${t}' and data_type = 'jsonb'`)).map((r) => r.column_name);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => {
      const o = { ...r };
      for (const c of jsonCols) if (o[c] !== null) o[c] = dst.json(o[c]);
      return o;
    });
    await dst`insert into ${dst(t)} ${dst(chunk)}`;
  }
  // Keep serial ids in step with the copied rows.
  const hasId = (await dst.unsafe(`select 1 from information_schema.columns where table_name = '${t}' and column_name = 'id'`)).length > 0;
  const seq = hasId ? await dst.unsafe(`select pg_get_serial_sequence('${t}', 'id') as s`) : [];
  if (seq[0]?.s) await dst.unsafe(`select setval('${seq[0].s}', coalesce((select max(id) from ${t}), 1))`);
  console.log(`${t}: ${rows.length}`);
}
await src.end();
await dst.end();
