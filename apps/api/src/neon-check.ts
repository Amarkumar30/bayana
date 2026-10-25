import "dotenv/config";
import pg from "pg";
import { checkNeonCompat, isPooledHost, NEON_CHECK_COUNT } from "./neon-compat.js";

// Usage (PowerShell): $env:NEON_CHECK_URL = "<Neon DIRECT connection string>"; pnpm.cmd db:check-neon
// Falls back to DATABASE_URL_DIRECT, then DATABASE_URL, from the environment or apps/api/.env.
// Read-only in effect: every statement runs inside a transaction that is rolled back. The URL is never printed.
const source = process.env.NEON_CHECK_URL ? "NEON_CHECK_URL" : process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
const url = process.env[source];
if (!url) { process.stderr.write("Set NEON_CHECK_URL to the Neon direct connection string (or DATABASE_URL_DIRECT).\n"); process.exit(1); }

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
