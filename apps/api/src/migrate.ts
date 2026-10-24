import { Client } from "pg";
import { config } from "./config.js";
import { assertTestDatabase } from "./database.js";
import { loadMigrationFiles, runMigrations } from "./migration-runner.js";

// Migrations use the direct (unpooled) connection; advisory locks do not survive a transaction-mode pooler.
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL_DIRECT);
const statusOnly = process.argv.includes("--status");
const client = new Client({ connectionString: config.DATABASE_URL_DIRECT });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(4815162342)");
  const rows = await runMigrations(client, await loadMigrationFiles(new URL("../sql/", import.meta.url)), { statusOnly });
  if (statusOnly) process.stdout.write(`${JSON.stringify(rows)}\n`);
} finally {
  await client.query("SELECT pg_advisory_unlock(4815162342)").catch(() => undefined);
  await client.end();
}
