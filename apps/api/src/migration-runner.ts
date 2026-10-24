import { readFile, readdir } from "node:fs/promises";
import type { ClientBase } from "pg";
import { log } from "./logger.js";
import { assertAppliedChecksum, migrationChecksum } from "./migration-checksums.js";

export type MigrationFile = { name: string; sql: string };
export type MigrationRow = { name: string; checksum: string | null; applied_at: Date };
const tablePattern = /^(pg_temp\.)?[a-z_][a-z0-9_]*$/;

export async function loadMigrationFiles(directory: URL): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async name => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

/** Applies pending files in order, each in its own transaction. Fails before applying anything new if an applied file changed. */
export async function runMigrations(client: ClientBase, files: MigrationFile[], options: { table?: string; statusOnly?: boolean } = {}): Promise<MigrationRow[]> {
  const table = options.table ?? "schema_migrations";
  if (!tablePattern.test(table)) throw new Error("Invalid migrations table name");
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checksum text`);
  const applied = new Map((await client.query<{ name: string; checksum: string | null }>(`SELECT name,checksum FROM ${table}`)).rows.map(row => [row.name, row.checksum]));
  for (const file of files) if (applied.has(file.name)) assertAppliedChecksum(file.name, applied.get(file.name) ?? null, file.sql);
  for (const file of files) {
    const hash = migrationChecksum(file.sql);
    if (applied.has(file.name)) {
      if (!applied.get(file.name)) { await client.query(`UPDATE ${table} SET checksum=$2 WHERE name=$1`, [file.name, hash]); log("warn", "migration.checksum_backfilled", { name: file.name }); }
      continue;
    }
    if (options.statusOnly) continue;
    await client.query("BEGIN");
    try { await client.query(file.sql); await client.query(`INSERT INTO ${table}(name,checksum) VALUES($1,$2)`, [file.name, hash]); await client.query("COMMIT"); log("info", "migration.applied", { name: file.name }); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  return (await client.query<MigrationRow>(`SELECT name,checksum,applied_at FROM ${table} ORDER BY name`)).rows;
}
