import { Client } from "pg";
import { config } from "./config.js";

const target = new URL(config.DATABASE_URL);
const database = decodeURIComponent(target.pathname.slice(1));
if (!database.endsWith("_test") || !/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error("DATABASE_URL must name a safe database ending in _test");
target.pathname = "/postgres";
const client = new Client({ connectionString: target.toString() });
await client.connect();
try {
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${database}"`);
} finally {
  await client.end();
}
