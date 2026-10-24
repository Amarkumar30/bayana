import { Client } from "pg";
import { config } from "./config.js";
import { log } from "./logger.js";

// Local helper: creates the databases named by DATABASE_URL and DATABASE_URL_TEST if they are missing. Never drops anything.
if (config.NODE_ENV === "production") throw new Error("db:create is a local development helper and refuses to run in production");
const targets = [...new Set([config.DATABASE_URL, config.DATABASE_URL_TEST].filter((url): url is string => Boolean(url)))];
for (const url of targets) {
  const target = new URL(url);
  const database = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error("Database names must match ^[a-z_][a-z0-9_]*$");
  target.pathname = "/postgres";
  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]);
    if (!exists.rowCount) { await client.query(`CREATE DATABASE "${database}"`); log("info", "database.created", { database }); }
  } finally {
    await client.end();
  }
}
