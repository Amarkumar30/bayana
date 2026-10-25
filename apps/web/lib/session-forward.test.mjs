// Run with: pnpm.cmd --filter @bayana/web test:unit (node --test with type stripping; no extra test framework).
// Proves the server-side API call carries the visitor's session cookie on the wire, and nothing else.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { fetchWithSession, SESSION_COOKIE, sessionCookieHeader } from "./session-forward.ts";

const token = "A".repeat(20) + "b-_9".repeat(5) + "zzz"; // 43 base64url characters, like randomBytes(32).toString("base64url")
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
    const response = await fetchWithSession(apiUrl, "/v1/auth/me", jar({ [SESSION_COOKIE]: token, theme: "dark", _ga: "tracking" }));
    assert.equal(response.status, 200);
    assert.deepEqual(seen.at(-1), { method: "GET", url: "/v1/auth/me", cookie: `${SESSION_COOKIE}=${token}` });
  });
  it("sends no Cookie header for a signed-out visitor", async () => {
    await fetchWithSession(apiUrl, "/v1/auth/me", jar({ theme: "dark" }));
    assert.equal(seen.at(-1).cookie, undefined);
  });
  it("refuses values that could inject cookies or headers", () => {
    for (const value of [`${token}; admin=1`, `${token}\r\nX-Evil: 1`, "short", `${token}x`, ""]) assert.equal(sessionCookieHeader(jar({ [SESSION_COOKIE]: value })), undefined, JSON.stringify(value));
  });
  it("posts JSON with the cookie", async () => {
    await fetchWithSession(apiUrl, "/v1/vendor/settings", jar({ [SESSION_COOKIE]: token }), { method: "PATCH", body: { a: 1 } });
    assert.deepEqual(seen.at(-1), { method: "PATCH", url: "/v1/vendor/settings", cookie: `${SESSION_COOKIE}=${token}` });
  });
});
