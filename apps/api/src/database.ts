import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";
import { log } from "./logger.js";

/**
 * Sized for Neon's pooled endpoint on the free plan. A suspended Neon compute can take seconds to wake, hence the 15 s connect
 * timeout; idle clients are closed after 10 s rather than left for Neon or PgBouncer to cut. The URL must carry
 * ?sslmode=require (docs/DEPLOY.md section 2).
 */
export const poolSettings = { max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 } as const;
export const pool = new Pool({ connectionString: config.DATABASE_URL, ...poolSettings });
/** An idle client dropped by the server (Neon suspend, a PgBouncer restart) emits "error" on the pool; unhandled, it would crash the process. */
export function logPoolError(error: Error & { code?: string }) { log("error", "database.idle_client_error", { pgCode: error.code, err: error.message }); }
pool.on("error", logPoolError);

export function assertTestDatabase(url: string) { if (!new URL(url).pathname.endsWith("_test")) throw new Error("Tests require DATABASE_URL to name a database ending in _test"); }
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL);
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) { const client = await pool.connect(); try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }

// Connection reset, timeout, server-side termination (57P01 admin shutdown) and connection failure (08006).
const transientCodes = new Set(["ECONNRESET", "ETIMEDOUT", "57P01", "08006"]);
export const isTransientConnectionError = (error: unknown) => transientCodes.has((error as { code?: unknown } | null)?.code as string);
/**
 * Retries a READ-ONLY query once when its connection was dropped (the next attempt takes a fresh one). Only for reads such as
 * /ready: a write retried after an unknown outcome could apply twice.
 */
export async function readWithOneRetry<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch (error) {
    if (!isTransientConnectionError(error)) throw error;
    log("warn", "database.read_retried", { pgCode: (error as { code?: string }).code });
    return read();
  }
}
