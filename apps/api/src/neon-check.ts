import "dotenv/config";
import pg from "pg";
import { loadDatabaseConfig } from "./config-schema.js";
import { checkNeonCompat, isPooledHost, NEON_CHECK_COUNT } from "./neon-compat.js";

// Usage (PowerShell): $env:NEON_CHECK_URL = "<Neon DIRECT connection string>"; pnpm.cmd db:check-neon
// Without NEON_CHECK_URL it uses the database-only config (the same target as migrations: DATABASE_URL_DIRECT, falling back to
// DATABASE_URL outside production). No mail, secrets, payment or Google settings are needed.
// Read-only in effect: every statement runs inside a transaction that is rolled back. The URL is never printed.
function checkTarget(): { url: string; source: string } {
  const explicit = process.env.NEON_CHECK_URL;
  if (explicit) {
    if (!/^postgres(ql)?:\/\//.test(explicit) || !URL.canParse(explicit)) { process.stderr.write("NEON_CHECK_URL must be a postgres:// URL (the Neon direct connection string).\n"); process.exit(1); }
    return { url: explicit, source: "NEON_CHECK_URL" };
  }
  try { const { databaseUrl, variable } = loadDatabaseConfig(); return { url: databaseUrl, source: variable }; }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid environment"}\nOr set NEON_CHECK_URL to the Neon direct connection string.\n`); process.exit(1); }
}
const { url, source } = checkTarget();

const target = new URL(url);
process.stdout.write(`Checking database "${decodeURIComponent(target.pathname.slice(1))}" on ${target.hostname} (from ${source})\n`);
if (isPooledHost(url)) process.stdout.write("Note: this is a pooled (-pooler) host. Use the direct URL for this check and for migrations.\n");

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
await client.connect();
try {
  const results = await checkNeonCompat(client);
  for (const result of results) process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}\n`);
  process.exitCode = results.length === NEON_CHECK_COUNT && results.every(result => result.ok) ? 0 : 1;
} finally {
  await client.end();
}
