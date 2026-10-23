import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";
export const pool = new Pool({ connectionString: config.DATABASE_URL });
export function assertTestDatabase(url: string) { if (!new URL(url).pathname.endsWith("_test")) throw new Error("Tests require DATABASE_URL to name a database ending in _test"); }
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL);
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) { const client = await pool.connect(); try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
