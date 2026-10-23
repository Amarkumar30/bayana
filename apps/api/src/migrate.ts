import { readFile, readdir } from "node:fs/promises";
import { pool } from "./database.js";
const sqlDirectory = new URL("../sql/", import.meta.url);
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
// Databases created before migration tracking already contain 001's tables.
const legacy = await pool.query("SELECT to_regclass('public.photographers') IS NOT NULL AS present");
if (legacy.rows[0].present) await pool.query("INSERT INTO schema_migrations(name) VALUES ('001_init.sql') ON CONFLICT DO NOTHING");
for (const name of (await readdir(sqlDirectory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
  const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
  if (applied.rowCount) continue;
  const sql = await readFile(new URL(name, sqlDirectory), "utf8");
  await pool.query("BEGIN");
  try { await pool.query(sql); await pool.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]); await pool.query("COMMIT"); console.log(`Applied ${name}`); }
  catch (error) { await pool.query("ROLLBACK"); throw error; }
}
await pool.end();
