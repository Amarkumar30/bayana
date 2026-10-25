import { Client } from "pg";
import { databaseNameProblem } from "./config-schema.js";
import { databaseConfig } from "./db-config.js";
import { loadMigrationFiles, migrationRefusal, pendingMigrations, runMigrations } from "./migration-runner.js";

// Migrations use the direct (unpooled) connection; advisory locks do not survive a transaction-mode pooler.
// Only NODE_ENV and the database URL are read (db-config.ts): no mail, secrets, payment or Google settings are needed.
const { NODE_ENV, databaseUrl, variable } = databaseConfig;
const statusOnly = process.argv.includes("--status");
const target = new URL(databaseUrl);
const databaseName = decodeURIComponent(target.pathname.slice(1));
// Tests may only ever touch a _test database, even just to read its status.
if (NODE_ENV === "test" && !databaseName.endsWith("_test")) { process.stderr.write(`${migrationRefusal(variable, databaseName, "must name a database ending in _test when NODE_ENV=test", NODE_ENV)}\n`); process.exit(1); }
const files = await loadMigrationFiles(new URL("../sql/", import.meta.url));
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const pending = await pendingMigrations(client, files);
  process.stdout.write(`Database "${databaseName}" (NODE_ENV=${NODE_ENV}): ${pending.length ? `${pending.length} pending migration${pending.length > 1 ? "s" : ""}:\n${pending.map(name => `  - ${name}`).join("\n")}` : "no pending migrations."}\n`);
  const problem = statusOnly ? null : databaseNameProblem(databaseUrl, NODE_ENV);
  if (statusOnly) {
    // --status only reports; it never writes.
  } else if (problem) {
    process.stderr.write(`${migrationRefusal(variable, databaseName, problem, NODE_ENV)}\n`);
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
