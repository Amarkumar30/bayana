// Run with: pnpm.cmd --filter @bayana/web test:unit (node --test with type stripping; no extra test framework).
// Proves the server-side API call carries the visitor's session cookie on the wire, and nothing else.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { loadServerEnv } from "../env-schema.ts";
import { fetchWithSession, sessionCookieHeader } from "./session-forward.ts";

const SESSION_COOKIE = "bayana_session", STAGING_COOKIE = "bayana_staging_session";
const token = "A".repeat(20) + "b-_9".repeat(5) + "zzz"; // 43 base64url characters, like randomBytes(32).toString("base64url")
const otherToken = "B".repeat(43);
const jar = values => ({ get: name => (name in values ? { value: values[name] } : undefined) });

let server; let apiUrl; const seen = [];
before(async () => {
  server = createServer((req, res) => { seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie }); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true })); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

describe("server-side API calls forward the session cookie", () => {
  it("sends exactly the session cookie to the API", async () => {
    const response = await fetchWithSession(apiUrl, "/v1/auth/me", jar({ [SESSION_COOKIE]: token, theme: "dark", _ga: "tracking" }), SESSION_COOKIE);
    assert.equal(response.status, 200);
    assert.deepEqual(seen.at(-1), { method: "GET", url: "/v1/auth/me", cookie: `${SESSION_COOKIE}=${token}` });
  });
  it("forwards only this environment's cookie when both environments' cookies are present", async () => {
    // A browser signed in to production sends its .bayana.in cookie to staging hosts too.
    const both = jar({ [SESSION_COOKIE]: otherToken, [STAGING_COOKIE]: token });
    await fetchWithSession(apiUrl, "/v1/auth/me", both, STAGING_COOKIE);
    assert.equal(seen.at(-1).cookie, `${STAGING_COOKIE}=${token}`);
    await fetchWithSession(apiUrl, "/v1/auth/me", jar({ [SESSION_COOKIE]: otherToken }), STAGING_COOKIE);
    assert.equal(seen.at(-1).cookie, undefined);
  });
  it("sends no Cookie header for a signed-out visitor", async () => {
    await fetchWithSession(apiUrl, "/v1/auth/me", jar({ theme: "dark" }), SESSION_COOKIE);
    assert.equal(seen.at(-1).cookie, undefined);
  });
  it("refuses values that could inject cookies or headers", () => {
    for (const value of [`${token}; admin=1`, `${token}\r\nX-Evil: 1`, "short", `${token}x`, ""]) assert.equal(sessionCookieHeader(jar({ [SESSION_COOKIE]: value }), SESSION_COOKIE), undefined, JSON.stringify(value));
  });
  it("posts JSON with the cookie", async () => {
    await fetchWithSession(apiUrl, "/v1/vendor/settings", jar({ [SESSION_COOKIE]: token }), SESSION_COOKIE, { method: "PATCH", body: { a: 1 } });
    assert.deepEqual(seen.at(-1), { method: "PATCH", url: "/v1/vendor/settings", cookie: `${SESSION_COOKIE}=${token}` });
  });
});

describe("SESSION_COOKIE_NAME (server-only web setting)", () => {
  it("defaults to bayana_session, takes the staging name, and refuses unsafe names", () => {
    assert.equal(loadServerEnv({}).SESSION_COOKIE_NAME, SESSION_COOKIE);
    assert.equal(loadServerEnv({ SESSION_COOKIE_NAME: "" }).SESSION_COOKIE_NAME, SESSION_COOKIE);
    assert.equal(loadServerEnv({ SESSION_COOKIE_NAME: STAGING_COOKIE }).SESSION_COOKIE_NAME, STAGING_COOKIE);
    for (const bad of ["a; Domain=evil.example", "a=b", "with space"]) assert.throws(() => loadServerEnv({ SESSION_COOKIE_NAME: bad }), error => /SESSION_COOKIE_NAME/.test(error.message) && !error.message.includes(bad));
  });
});
