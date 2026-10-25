// pnpm.cmd db:restore -- --file <backup.dump[.age]> [--identity <age-key.txt>] --confirm-target <database name>
// Restores a Bayana backup (from .github/workflows/backup.yml) into an EMPTY database, then prints the latest
// migration, row counts and the nightly consistency checks (SPEC 17.3 restore drill). Steps: docs/RESTORE.md.
//
// Safety: the target URL comes from the RESTORE_TARGET_URL environment variable and is never printed. The script refuses
// unless --confirm-target equals the target's database name and that database has no tables. It never drops, truncates
// or overwrites anything. PostgreSQL tools run in a throwaway postgres:16-alpine container (Docker Desktop is enough).
// A decrypted copy exists only in a private temp folder that is removed on every exit path.
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const IMAGE = "postgres:16-alpine";
class RestoreError extends Error {}
const refuse = message => { throw new RestoreError(message); };
const say = message => process.stdout.write(`${message}\n`);

/** Runs a shell command in the Postgres image with a file or string on stdin. RESTORE_URL is passed by name only. */
function inPostgres(env, script, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["run", "--rm", "-i", "-e", "RESTORE_URL", IMAGE, "sh", "-c", script], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => reject(new RestoreError(`could not run docker (${error.message}). Start Docker Desktop and try again.`)));
    child.on("close", status => resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() }));
    if (stdin.file) createReadStream(stdin.file).pipe(child.stdin); else child.stdin.end(stdin.text);
  });
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, identity: { type: "string" }, "confirm-target": { type: "string" } } });
  if (!values.file || !existsSync(values.file)) refuse("pass --file with the path to a .dump or .dump.age backup.");
  if (!process.env.RESTORE_TARGET_URL) refuse("set RESTORE_TARGET_URL to the EMPTY database to restore into (for example a new local database or Neon branch).");
  let targetUrl;
  try { targetUrl = new URL(process.env.RESTORE_TARGET_URL); } catch { refuse("RESTORE_TARGET_URL is not a valid postgres:// URL."); }
  const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
  if (!databaseName) refuse("RESTORE_TARGET_URL must name a database.");
  if (values["confirm-target"] !== databaseName) refuse(`pass --confirm-target with the target database's name exactly (the URL names "${databaseName}").`);
  // Inside the container, the host's localhost is host.docker.internal.
  if (["localhost", "127.0.0.1", "[::1]"].includes(targetUrl.hostname)) targetUrl.hostname = "host.docker.internal";
  const env = { ...process.env, RESTORE_URL: targetUrl.toString() };
  const sql = async query => {
    const result = await inPostgres(env, 'psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -X -q -tA -f -', { text: query });
    if (result.status !== 0) refuse(`query failed: ${result.stderr}`);
    return result.stdout;
  };

  const workDir = mkdtempSync(path.join(tmpdir(), "bayana-restore-"));
  try {
    let dump = values.file;
    if (values.file.endsWith(".age")) {
      if (!values.identity || !existsSync(values.identity)) refuse("this backup is encrypted: pass --identity with your age private key file (see docs/RESTORE.md).");
      dump = path.join(workDir, "backup.dump");
      const decrypted = spawnSync("age", ["--decrypt", "-i", values.identity, "-o", dump, values.file], { encoding: "utf8" });
      if (decrypted.error) refuse("the age command was not found. Install it (winget install FiloSottile.age), reopen PowerShell and try again.");
      if (decrypted.status !== 0) refuse(`decryption failed: ${decrypted.stderr.trim()}`);
    }
    say(`Backup: ${path.basename(values.file)} (${(statSync(dump).size / 1024 / 1024).toFixed(2)} MB decrypted)`);

    const listing = await inPostgres(env, "pg_restore --list", { file: dump });
    if (listing.status !== 0) refuse(`the file is not a readable pg_dump custom-format archive: ${listing.stderr}`);
    say(`Archive OK: ${listing.stdout.split("\n").filter(line => line && !line.startsWith(";")).length} entries`);

    const tables = Number(await sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'"));
    if (tables !== 0) refuse(`"${databaseName}" already has ${tables} table(s). Restore only into an empty database; create a new one instead.`);

    say(`Restoring into "${databaseName}" in a single transaction...`);
    const restored = await inPostgres(env, 'pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d "$RESTORE_URL"', { file: dump });
    if (restored.status !== 0) refuse(`pg_restore failed and nothing was committed: ${restored.stderr}`);

    say(`Latest migration: ${await sql("SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1")}`);
    for (const table of ["users", "vendors", "services", "bookings", "booking_events", "payments", "ledger_entries"]) say(`  ${table}: ${await sql(`SELECT count(*) FROM ${table}`)} rows`);
    // The same read-only checks as the nightly consistency job (apps/api/src/jobs.ts). Old holds past expiry are expected
    // in a restored copy because no tick has run on it; anything else needs a look.
    const checks = {
      confirmed_without_payment: "SELECT count(*) FROM bookings b WHERE b.status IN ('CONFIRMED','COMPLETED') AND b.advance_paise > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status IN ('captured','refunded','partially_refunded') AND p.verified_at IS NOT NULL)",
      holds_past_expiry: "SELECT count(*) FROM bookings WHERE status IN ('HELD','PENDING') AND hold_expires_at < now() - interval '1 hour'",
      bookings_without_events: "SELECT count(*) FROM bookings b LEFT JOIN booking_events e ON e.booking_id=b.id WHERE e.id IS NULL",
      paid_after_expiry_unrefunded: "SELECT count(*) FROM bookings b WHERE b.status='EXPIRED_PAID' AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.booking_id=b.id AND r.status IN ('pending','processed'))"
    };
    say("Consistency checks (0 is clean):");
    for (const [name, query] of Object.entries(checks)) say(`  ${name}: ${await sql(query)}`);
    say("Restore complete. Record the date and result in the drill log in docs/RESTORE.md.");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`restore: ${error instanceof RestoreError ? error.message : error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
