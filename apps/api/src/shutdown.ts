import type { Server } from "node:http";
import { log } from "./logger.js";

export const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Render sends SIGTERM on every deploy and restart. Stop accepting connections, let in-flight requests finish (at most
 * graceMs, then the remaining sockets are cut), close the database pool, and exit 0. Safe to call twice (SIGTERM then SIGINT).
 */
export function gracefulShutdown(server: Server, closePool: () => Promise<void>, options: { graceMs?: number; exit?: (code: number) => void } = {}) {
  const { graceMs = SHUTDOWN_GRACE_MS, exit = (code: number) => process.exit(code) } = options;
  let stopping: Promise<void> | undefined;
  return (signal: string) => (stopping ??= (async () => {
    log("info", "server.stopping", { signal, graceMs });
    const closed = new Promise<void>(resolve => server.close(() => resolve()));
    // Keep-alive sockets with no request in flight would hold close() open until they time out; requests in flight keep theirs.
    server.closeIdleConnections();
    const timer = setTimeout(() => { log("warn", "server.shutdown_grace_expired", { graceMs }); server.closeAllConnections(); }, graceMs);
    await closed;
    clearTimeout(timer);
    await closePool().catch(error => log("error", "server.pool_close_failed", { err: error instanceof Error ? error.message : String(error) }));
    log("info", "server.stopped", { signal });
    exit(0);
  })());
}
