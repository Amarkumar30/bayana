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

/** The message db:migrate prints when the target database's name does not match NODE_ENV. Names only, never the URL (it holds a password). */
export function migrationRefusal(variable: string, databaseName: string, problem: string, nodeEnv: string) {
  return [
    `Refusing to migrate: ${variable} ${problem}. It currently names database "${databaseName}". Nothing was changed.`,
    ...(nodeEnv === "development" ? [
      "To keep your data and move it to bayana_dev (Windows PowerShell, from the repository root):",
      `  1. Back up:   docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/${databaseName}.dump ${databaseName}`,
      `                docker cp bayana-postgres-1:/tmp/${databaseName}.dump backups\\${databaseName}.dump`,
      "  2. Point DATABASE_URL in apps/api/.env at .../bayana_dev, then run: pnpm.cmd db:create",
      `  3. Restore:   docker exec bayana-postgres-1 pg_restore -U bayana -d bayana_dev /tmp/${databaseName}.dump`,
      "  4. Migrate:   pnpm.cmd db:migrate"
    ] : [])
  ].join("\n");
}

/** Read-only: names of files not yet recorded in the migrations table (all of them if the table does not exist yet). */
export async function pendingMigrations(client: ClientBase, files: MigrationFile[], table = "schema_migrations"): Promise<string[]> {
  if (!tablePattern.test(table)) throw new Error("Invalid migrations table name");
  const exists = (await client.query<{ name: string | null }>("SELECT to_regclass($1) AS name", [table])).rows[0].name;
  if (!exists) return files.map(file => file.name);
  const applied = new Set((await client.query<{ name: string }>(`SELECT name FROM ${table}`)).rows.map(row => row.name));
  return files.map(file => file.name).filter(name => !applied.has(name));
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
