import type { ClientBase } from "pg";

// SPEC 16.5 step 1 and AGENTS.md section 7: before the first deploy, prove the target database supports what the schema
// and runtime rely on. Everything runs in one transaction that is rolled back, so the check is safe to repeat and leaves
// nothing behind (migration 008 creates btree_gist for real).
export type NeonCheck = { name: string; ok: boolean; detail: string };
/** A run passes only when every one of these ran and passed; a failing step stops the rest. */
export const NEON_CHECK_COUNT = 4;

async function step(results: NeonCheck[], name: string, run: () => Promise<string>) {
  try { results.push({ name, ok: true, detail: await run() }); }
  catch (error) { results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) }); throw error; }
}

export async function checkNeonCompat(client: ClientBase): Promise<NeonCheck[]> {
  const results: NeonCheck[] = [];
  await client.query("BEGIN");
  try {
    await step(results, "postgres_16_or_newer", async () => {
      const version = Number((await client.query<{ v: string }>("SELECT current_setting('server_version_num') AS v")).rows[0].v);
      if (version < 160000) throw new Error(`server_version_num is ${version}; Bayana is built and tested on PostgreSQL 16`);
      return `server_version_num ${version}`;
    });
    await step(results, "create_extension_btree_gist", async () => {
      await client.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
      const found = await client.query("SELECT 1 FROM pg_extension WHERE extname='btree_gist'");
      if (found.rowCount !== 1) throw new Error("btree_gist is not installed after CREATE EXTENSION");
      return "CREATE EXTENSION btree_gist succeeded";
    });
    await step(results, "exclusion_constraint_rejects_overlap", async () => {
      // Same shape as the double-booking guard (SPEC 8.3): equal vendor and overlapping half-open ranges conflict.
      await client.query("CREATE TEMP TABLE neon_check_guard (vendor_id uuid NOT NULL, during tstzrange NOT NULL, EXCLUDE USING gist (vendor_id WITH =, during WITH &&)) ON COMMIT DROP");
      const vendor = "00000000-0000-4000-8000-000000000001";
      await client.query("INSERT INTO neon_check_guard VALUES ($1, tstzrange('2030-01-01 10:00Z','2030-01-01 11:00Z','[)'))", [vendor]);
      await client.query("INSERT INTO neon_check_guard VALUES ($1, tstzrange('2030-01-01 11:00Z','2030-01-01 12:00Z','[)'))", [vendor]);
      await client.query("SAVEPOINT overlap");
      try { await client.query("INSERT INTO neon_check_guard VALUES ($1, tstzrange('2030-01-01 10:30Z','2030-01-01 10:45Z','[)'))", [vendor]); }
      catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT overlap");
        if ((error as { code?: string }).code === "23P01") return "overlap rejected with 23P01; back-to-back ranges allowed";
        throw error;
      }
      throw new Error("an overlapping range was accepted");
    });
    await step(results, "transaction_scoped_lock_and_settings", async () => {
      // The only lock and setting forms that are safe behind PgBouncer in transaction mode.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('neon-check', 0))");
      await client.query("SET LOCAL statement_timeout = '5s'");
      return "pg_advisory_xact_lock and SET LOCAL work";
    });
  } catch {
    // The failing step is already recorded; fall through to the rollback.
  } finally {
    await client.query("ROLLBACK");
  }
  return results;
}

/** Neon's pooled endpoint has "-pooler" in its host. The API runtime uses it; migrations and this check use the direct one. */
export const isPooledHost = (url: string) => new URL(url).hostname.includes("-pooler");
