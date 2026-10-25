import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { pool, poolSettings } from "../../src/database.js";
import { createLogger, setLogger } from "../../src/logger.js";

let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { setLogger(createLogger()); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

describe("database pool for Neon", () => {
  it("uses the Neon settings: at most 10 clients, 10 s idle, 15 s to connect (Neon may be waking)", () => {
    expect(poolSettings).toEqual({ max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 });
    expect(pool.options).toMatchObject(poolSettings);
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("an idle client dropped by the server is logged, never crashes the process, and the pool keeps serving", async () => {
    const lines: string[] = [];
    setLogger(createLogger(new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }), "info"));
    // Put one client in the pool idle, then kill its backend from outside, as a Neon suspend or PgBouncer restart would.
    const idle = await pool.connect(); const pid = (await idle.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid; idle.release();
    const admin = new Client({ connectionString: config.DATABASE_URL }); await admin.connect();
    try { expect((await admin.query("SELECT pg_terminate_backend($1) AS ok", [pid])).rows[0].ok).toBe(true); } finally { await admin.end(); }
    for (let tries = 0; tries < 100 && !lines.some(line => line.includes("database.idle_client_error")); tries++) await new Promise(resolve => setTimeout(resolve, 20));
    const logged = lines.map(line => JSON.parse(line) as { event: string; pgCode?: string }).find(line => line.event === "database.idle_client_error");
    expect(logged?.pgCode).toBe("57P01");
    // Still alive and serving: /ready and an ordinary query both work on a fresh connection.
    expect((await fetch(`${base}/ready`)).status).toBe(200);
    expect((await pool.query("SELECT 1 AS one")).rows[0].one).toBe(1);
  });
});
