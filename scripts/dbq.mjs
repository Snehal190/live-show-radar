// Dev helper: run one SQL query against DATABASE_URL from .env.local and print rows.
import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local", quiet: true });
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const rows = await sql.unsafe(process.argv[2]);
console.table(rows);
await sql.end();
