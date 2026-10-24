import { Client } from "pg";
import { config, databaseNameProblem } from "./config.js";
import { assertTestDatabase } from "./database.js";
import { loadMigrationFiles, migrationRefusal, pendingMigrations, runMigrations } from "./migration-runner.js";

// Migrations use the direct (unpooled) connection; advisory locks do not survive a transaction-mode pooler.
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL_DIRECT);
const statusOnly = process.argv.includes("--status");
const target = new URL(config.DATABASE_URL_DIRECT);
const databaseName = decodeURIComponent(target.pathname.slice(1));
const files = await loadMigrationFiles(new URL("../sql/", import.meta.url));
const client = new Client({ connectionString: config.DATABASE_URL_DIRECT });
await client.connect();
try {
  const pending = await pendingMigrations(client, files);
  process.stdout.write(`Database "${databaseName}" (NODE_ENV=${config.NODE_ENV}): ${pending.length ? `${pending.length} pending migration${pending.length > 1 ? "s" : ""}:\n${pending.map(name => `  - ${name}`).join("\n")}` : "no pending migrations."}\n`);
  const problem = statusOnly ? null : databaseNameProblem(config.DATABASE_URL_DIRECT, config.NODE_ENV);
  if (statusOnly) {
    // --status only reports; it never writes.
  } else if (problem) {
    const variable = config.NODE_ENV === "test" ? "DATABASE_URL_TEST" : process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
    process.stderr.write(`${migrationRefusal(variable, databaseName, problem, config.NODE_ENV)}\n`);
    process.exitCode = 1;
  } else {
    // Runs even with nothing pending: runMigrations re-verifies every applied file's checksum.
    await client.query("SELECT pg_advisory_lock(4815162342)");
    try { await runMigrations(client, files); } finally { await client.query("SELECT pg_advisory_unlock(4815162342)").catch(() => undefined); }
    process.stdout.write(pending.length ? `Applied ${pending.length} migration${pending.length > 1 ? "s" : ""}.\n` : "Checksums of applied migrations verified.\n");
  }
} finally {
  await client.end();
}
