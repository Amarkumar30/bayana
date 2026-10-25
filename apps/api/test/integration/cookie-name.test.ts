import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser } from "../helpers.js";

// The whole app runs as staging here: config is read when the app is first imported, and vitest isolates modules per file.
process.env.SESSION_COOKIE_NAME = "bayana_staging_session";
const { app } = await import("../../src/app.js");
const { startSession } = await import("../../src/auth.js");
const { pool, transaction } = await import("../../src/database.js");

let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); delete process.env.SESSION_COOKIE_NAME; });

const me = (cookie: string) => fetch(`${base}/v1/auth/me`, { headers: { cookie } });
const tokenFor = async () => transaction(async db => startSession(db, (await createUser(pool)).id));

describe("SESSION_COOKIE_NAME keeps environments apart", () => {
  it("a valid session under the other environment's cookie name is ignored", async () => {
    const token = await tokenFor();
    expect((await me(`bayana_session=${token}`)).status).toBe(401);
    expect((await me(`bayana_staging_session=${token}`)).status).toBe(200);
    // Both present, as a browser signed in to production sends to staging hosts: staging reads only its own.
    expect((await me(`bayana_session=not-a-real-token-at-all-0000000000000000000; bayana_staging_session=${token}`)).status).toBe(200);
  });
  it("sets and clears the cookie under the configured name", async () => {
    const token = await tokenFor();
    const out = await fetch(`${base}/v1/auth/logout`, { method: "POST", headers: { cookie: `bayana_staging_session=${token}`, "content-type": "application/json" }, body: "{}" });
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie().some(value => value.startsWith("bayana_staging_session=;"))).toBe(true);
    expect(out.headers.getSetCookie().some(value => value.startsWith("bayana_session="))).toBe(false);
    expect((await me(`bayana_staging_session=${token}`)).status).toBe(401);
  });
});
