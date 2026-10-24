import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { assertTestDatabase } from "../../src/database.js";
import { runMigrations } from "../../src/migration-runner.js";

// A pg_temp table and pg_temp objects vanish with this session, so the test leaves nothing behind.
const table = "pg_temp.migrations_probe";
let client: Client;
beforeAll(async () => { assertTestDatabase(config.DATABASE_URL); client = new Client({ connectionString: config.DATABASE_URL }); await client.connect(); });
afterAll(async () => { await client.end(); });

describe("migration runner", () => {
  it("applies pending files once, in order, and records checksums", async () => {
    const files = [{ name: "001_a.sql", sql: "CREATE TEMP TABLE probe_a(id int);" }, { name: "002_b.sql", sql: "CREATE TEMP TABLE probe_b(id int);" }];
    const first = await runMigrations(client, files, { table });
    const second = await runMigrations(client, files, { table });
    expect(first.map(row => row.name)).toEqual(["001_a.sql", "002_b.sql"]);
    expect(second).toEqual(first);
    expect(first.every(row => /^[0-9a-f]{64}$/.test(row.checksum ?? ""))).toBe(true);
  });
  it("fails, applying nothing new, when an applied file has changed", async () => {
    const changed = [{ name: "001_a.sql", sql: "CREATE TEMP TABLE probe_a(id bigint);" }, { name: "002_b.sql", sql: "CREATE TEMP TABLE probe_b(id int);" }, { name: "003_c.sql", sql: "CREATE TEMP TABLE probe_c(id int);" }];
    await expect(runMigrations(client, changed, { table })).rejects.toThrow("Applied migration checksum changed: 001_a.sql");
    const applied = await client.query<{ name: string }>(`SELECT name FROM ${table} ORDER BY name`);
    expect(applied.rows.map(row => row.name)).toEqual(["001_a.sql", "002_b.sql"]);
  });
  it("rolls back a failing migration and does not record it", async () => {
    const files = [{ name: "001_a.sql", sql: "CREATE TEMP TABLE probe_a(id int);" }, { name: "002_b.sql", sql: "CREATE TEMP TABLE probe_b(id int);" }, { name: "003_bad.sql", sql: "CREATE TEMP TABLE probe_d(id int); SELECT missing_column FROM probe_d;" }];
    await expect(runMigrations(client, files, { table })).rejects.toThrow();
    const recorded = await client.query(`SELECT 1 FROM ${table} WHERE name='003_bad.sql'`);
    const created = await client.query("SELECT to_regclass('pg_temp.probe_d') AS name");
    expect(recorded.rowCount).toBe(0);
    expect(created.rows[0].name).toBeNull();
  });
  it("rejects unsafe table names", async () => {
    await expect(runMigrations(client, [], { table: "schema_migrations; DROP TABLE users" })).rejects.toThrow("Invalid migrations table name");
  });
});
