import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "../../src/config-schema.js";

// AGENTS.md section 7 / SPEC 16.5: the runtime connects through Neon's PgBouncer in transaction mode, where a session
// outlives no transaction. Session-level advisory locks, plain SET (or set_config(..., false)) and LISTEN/NOTIFY would
// leak onto other clients' server connections or silently stop working. Only transaction-scoped forms are allowed.
const sourceRoot = new URL("../../src/", import.meta.url);

const rules = {
  // pg_advisory_lock, pg_try_advisory_lock, pg_advisory_unlock, *_shared and pg_advisory_unlock_all; the _xact_ forms do not match.
  sessionLock: /\bpg_(?:try_)?advisory_(?:un)?lock(?:_shared|_all)?\s*\(/gi,
  // SET at the start of a statement (after a quote, backtick or semicolon) that is not SET LOCAL or SET CONSTRAINTS.
  // UPDATE ... SET col = ... never starts a statement, so it does not match. Keywords are matched in upper case, as this
  // codebase writes SQL, so English messages such as "is missing; set it to ..." are not flagged.
  plainSet: /(?:^|[`"';])\s*SET\s+(?!LOCAL\b|CONSTRAINTS\b)(?:SESSION\s+)?[A-Za-z_."]+\s*(?:=|\bTO\b)/g,
  sessionSetConfig: /\bset_config\s*\([^)]*,\s*false\s*\)/gi,
  listenNotify: /\b(?:LISTEN|UNLISTEN|NOTIFY)\s+["a-z_*]|\bpg_notify\s*\(|\.on\(\s*["']notification["']/g
} as const;

// migrate.ts holds a session-level advisory lock on purpose: it connects with DATABASE_URL_DIRECT (never the pooler)
// so two migration runs cannot interleave. No other file may.
const allowed: Partial<Record<keyof typeof rules, string[]>> = { sessionLock: ["migrate.ts"] };

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)) : Promise.resolve(/\.ts$/.test(entry.name) ? [new URL(entry.name, directory)] : [])));
  return nested.flat();
}
const matches = (pattern: RegExp, text: string) => { pattern.lastIndex = 0; const found = pattern.test(text); pattern.lastIndex = 0; return found; };

describe("PgBouncer transaction-mode safety", () => {
  it("the patterns catch the unsafe forms and pass the safe ones", () => {
    for (const sql of ["SELECT pg_advisory_lock(1)", "select pg_try_advisory_lock($1)", "SELECT pg_advisory_unlock(4815162342)", "SELECT pg_advisory_lock_shared(1)", "SELECT pg_advisory_unlock_all()"]) expect(matches(rules.sessionLock, sql), sql).toBe(true);
    for (const sql of ["SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", "SELECT pg_try_advisory_xact_lock(1)", "SELECT pg_advisory_xact_lock_shared(1)"]) expect(matches(rules.sessionLock, sql), sql).toBe(false);

    for (const sql of ['query("SET statement_timeout = 5000")', "query('SET search_path TO app')", "query(`SET SESSION timezone = 'UTC'`)", "BEGIN; SET lock_timeout = '1s'"]) expect(matches(rules.plainSet, sql), sql).toBe(true);
    for (const sql of ['query("SET LOCAL statement_timeout = 5000")', 'query("SET CONSTRAINTS ALL DEFERRED")', 'query("UPDATE users SET email_verified_at=now() WHERE id=$1")', "`UPDATE email_outbox\n  SET locked_until=now()`", 'query("INSERT INTO t(a) VALUES(1) ON CONFLICT(a) DO UPDATE SET a=1")', '`is missing; set it to ${rule}`']) expect(matches(rules.plainSet, sql), sql).toBe(false);

    expect(matches(rules.sessionSetConfig, "SELECT set_config('app.user', $1, false)")).toBe(true);
    expect(matches(rules.sessionSetConfig, "SELECT set_config('app.user', $1, true)")).toBe(false);

    for (const code of ['query("LISTEN booking_changes")', "query('NOTIFY jobs')", "SELECT pg_notify('jobs', $1)", 'client.on("notification", handler)']) expect(matches(rules.listenNotify, code), code).toBe(true);
    for (const code of ["// customers listen for the reminder", 'template: "notify_prefs"', "UPDATE vendors SET notify_prefs=$2"]) expect(matches(rules.listenNotify, code), code).toBe(false);
  });

  for (const [rule, pattern] of Object.entries(rules) as [keyof typeof rules, RegExp][]) {
    it(`no runtime source uses ${rule}${allowed[rule] ? ` (except ${allowed[rule]?.join(", ")})` : ""}`, async () => {
      const offenders: string[] = [];
      for (const file of await sourceFiles(sourceRoot)) {
        const name = file.pathname.slice(sourceRoot.pathname.length);
        if (matches(pattern, await readFile(file, "utf8")) && !allowed[rule]?.includes(name)) offenders.push(name);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("the migrate.ts exception still connects with DATABASE_URL_DIRECT", async () => {
    const text = await readFile(new URL("migrate.ts", sourceRoot), "utf8");
    expect(text).toMatch(/const \{[^}]*\bdatabaseUrl\b[^}]*\} = databaseConfig;/);
    expect(text).toMatch(/new Client\(\{\s*connectionString:\s*databaseUrl\s*\}\)/);
    // ...and that URL is the direct one in production, never the pooled DATABASE_URL.
    const direct = "postgres://u:p@ep-x.ap-southeast-1.aws.neon.tech/bayana", pooled = "postgres://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/bayana";
    expect(loadDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_DIRECT: direct })).toMatchObject({ databaseUrl: direct, variable: "DATABASE_URL_DIRECT" });
  });
});
