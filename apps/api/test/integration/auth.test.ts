import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { hashPassword } from "../../src/auth.js";
import { pool } from "../../src/database.js";
import { capturedEmails } from "../../src/email.js";

// HTTP-level tests for SPEC 4.1 (AU-01..AU-09) against bayana_test. Each test uses its own client IP via
// X-Forwarded-For (TRUST_PROXY=1 in test scripts) so per-IP rate limits behave as they would for real clients.
type Reply = { status: number; body: Record<string, unknown>; cookie?: string; setCookie: string; headers: Headers };
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

const newIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const newEmail = (tag: string) => `${tag}-${randomUUID().slice(0, 8)}@Example.test`;
const password = "correct-horse-battery-9";

function client(ip = newIp()) {
  let cookie: string | undefined;
  const call = async (method: string, path: string, body?: object): Promise<Reply> => {
    const response = await fetch(`${base}/v1/auth${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const setCookie = response.headers.get("set-cookie") ?? "";
    const match = /bayana_session=([^;]*)/.exec(setCookie);
    if (match) cookie = match[1] ? `bayana_session=${match[1]}` : undefined;
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : {}, cookie, setCookie, headers: response.headers };
  };
  return { ip, call, get cookie() { return cookie; }, set cookie(value: string | undefined) { cookie = value; } };
}

/** OTP emails are sent after the response; poll the in-memory capture for the newest code to this address. */
async function codeFor(email: string, since: number) {
  for (let tries = 0; tries < 50; tries++) {
    const message = capturedEmails().slice(since).reverse().find(item => item.to.toLowerCase() === email.toLowerCase());
    const code = message ? /\b(\d{6})\b/.exec(message.text)?.[1] : undefined;
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`No code emailed to ${email}`);
}
async function requestCode(c: ReturnType<typeof client>, email: string, purpose: "signup" | "login" | "reset") {
  const since = capturedEmails().length;
  const reply = await c.call("POST", "/otp/request", { email, purpose });
  expect(reply.status).toBe(202);
  return codeFor(email, since);
}
/** Lets a test request another code for the same purpose without waiting out the real 60 s cooldown. */
const expireCooldown = (email: string) => pool.query("UPDATE otp_codes SET last_sent_at = now() - interval '61 seconds' WHERE email_normalized=$1", [email.toLowerCase()]);
async function signUp(email = newEmail("vendor")) {
  const c = client(); const code = await requestCode(c, email, "signup");
  const reply = await c.call("POST", "/signup", { email, code, password });
  expect(reply.status).toBe(201);
  return { email, c, reply };
}
const userCount = async (email: string) => Number((await pool.query("SELECT count(*) FROM users WHERE email_normalized=$1", [email.toLowerCase()])).rows[0].count);

describe("AU-01 signup needs a verified code and a password", () => {
  it("creates nothing for a password without a valid code", async () => {
    const email = newEmail("nocode"); const c = client();
    await requestCode(c, email, "signup");
    const reply = await c.call("POST", "/signup", { email, code: "000000", password });
    expect(reply.status).toBe(400); expect(reply.body).toMatchObject({ error: { code: "OTP_INVALID" } });
    expect(await userCount(email)).toBe(0);
  });
  it("creates nothing for a code without an acceptable password, and leaves the code usable", async () => {
    const email = newEmail("nopw"); const c = client(); const code = await requestCode(c, email, "signup");
    expect((await c.call("POST", "/signup", { email, code })).status).toBe(400);
    expect((await c.call("POST", "/signup", { email, code, password: "short" })).body).toMatchObject({ error: { code: "INVALID_PASSWORD" } });
    expect(await userCount(email)).toBe(0);
    expect((await c.call("POST", "/signup", { email, code, password })).status).toBe(201);
    expect(await userCount(email)).toBe(1);
  });
  it("creates the account, a hashed session and a safe cookie when both succeed", async () => {
    const { reply, email } = await signUp();
    expect(reply.body).toEqual({ user: { id: expect.any(String), email: email.toLowerCase(), role: "VENDOR" } });
    expect(JSON.stringify(reply.body)).not.toContain("argon2");
    expect(reply.setCookie).toMatch(/HttpOnly/i); expect(reply.setCookie).toMatch(/SameSite=Lax/i); expect(reply.setCookie).not.toMatch(/Secure/i); expect(reply.setCookie).not.toMatch(/Domain=/i);
    const token = /bayana_session=([^;]+)/.exec(reply.setCookie)![1];
    const stored = await pool.query("SELECT token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.email_normalized=$1", [email.toLowerCase()]);
    expect(stored.rows).toHaveLength(1); expect(stored.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/); expect(stored.rows[0].token_hash).not.toContain(token);
  });
});

describe("AU-02 a vendor who signed up earlier can always sign in again", () => {
  it("signs in by password and by email code, repeatedly, right after signing out", async () => {
    const { email } = await signUp();
    for (let round = 0; round < 2; round++) {
      const c = client();
      const byPassword = await c.call("POST", "/login", { email, password });
      expect(byPassword.status).toBe(200); expect((await c.call("GET", "/me")).status).toBe(200);
      expect((await c.call("POST", "/logout")).status).toBe(204); expect((await c.call("GET", "/me")).status).toBe(401);
      await expireCooldown(email);
      const code = await requestCode(c, email, "login");
      expect((await c.call("POST", "/login", { email, code })).status).toBe(200);
      expect((await c.call("GET", "/me")).body).toMatchObject({ user: { email: email.toLowerCase(), role: "VENDOR" } });
      expect((await c.call("POST", "/logout")).status).toBe(204);
    }
  });
  it("can request a fresh login code immediately after using one (the original bug)", async () => {
    const { email } = await signUp(); const c = client();
    const first = await requestCode(c, email, "login");
    expect((await c.call("POST", "/login", { email, code: first })).status).toBe(200);
    await c.call("POST", "/logout");
    const second = await requestCode(c, email, "login");
    expect((await c.call("POST", "/login", { email, code: second })).status).toBe(200);
  });
  it("lets a legacy vendor with no password sign in by code and set a password by reset", async () => {
    const email = newEmail("legacy");
    await pool.query("INSERT INTO users(id,email,role) VALUES($1,$2,'VENDOR')", [randomUUID(), email]);
    const c = client();
    expect((await c.call("POST", "/login", { email, password })).status).toBe(401);
    const code = await requestCode(c, email, "login");
    expect((await c.call("POST", "/login", { email, code })).status).toBe(200);
    await expireCooldown(email);
    const resetCode = await requestCode(c, email, "reset");
    expect((await c.call("POST", "/password/reset", { email, code: resetCode, newPassword: password })).status).toBe(200);
    expect((await client().call("POST", "/login", { email, password })).status).toBe(200);
  });
  it("rotates the session token on every sign-in and kills the old one", async () => {
    const { c, email } = await signUp(); const before = c.cookie!;
    expect((await c.call("POST", "/login", { email, password })).status).toBe(200);
    expect(c.cookie).not.toBe(before);
    const stale = client(); stale.cookie = before;
    expect((await stale.call("GET", "/me")).status).toBe(401);
  });
});

describe("AU-03 one account per email, case-insensitive", () => {
  it("treats differently cased emails as the same account", async () => {
    const { email } = await signUp(newEmail("Case"));
    expect((await client().call("POST", "/login", { email: email.toUpperCase(), password })).status).toBe(200);
    await expireCooldown(email);
    const c = client(); const code = await requestCode(c, email.toUpperCase(), "signup");
    const again = await c.call("POST", "/signup", { email: email.toUpperCase(), code, password });
    expect(again.status).toBe(201); expect(await userCount(email)).toBe(1);
  });
  it("answers a repeat signup request exactly like a new one", async () => {
    const { email } = await signUp(); await expireCooldown(email);
    const known = await client().call("POST", "/otp/request", { email, purpose: "signup" });
    const unknown = await client().call("POST", "/otp/request", { email: newEmail("fresh"), purpose: "signup" });
    expect(known.status).toBe(unknown.status); expect(known.body).toEqual(unknown.body);
  });
  it("needs the existing password for a repeat signup, so it cannot hijack the account", async () => {
    const { email } = await signUp(); await expireCooldown(email);
    const c = client(); const code = await requestCode(c, email, "signup");
    expect((await c.call("POST", "/signup", { email, code, password: "a-different-password-7" })).status).toBe(401);
    expect((await client().call("POST", "/login", { email, password })).status).toBe(200);
  });
});

describe("AU-04 auth endpoints never reveal whether an email has an account", () => {
  it("gives identical status and body for known and unknown emails on every endpoint", async () => {
    const { email } = await signUp(); const unknown = newEmail("ghost");
    for (const purpose of ["login", "reset"] as const) {
      await expireCooldown(email);
      const a = await client().call("POST", "/otp/request", { email, purpose }); const b = await client().call("POST", "/otp/request", { email: unknown, purpose });
      expect([a.status, a.body]).toEqual([b.status, b.body]);
    }
    const wrongPassword = await client().call("POST", "/login", { email, password: "not-the-password-1" });
    const noAccount = await client().call("POST", "/login", { email: unknown, password });
    expect([wrongPassword.status, wrongPassword.body]).toEqual([noAccount.status, noAccount.body]);
    const badCodeKnown = await client().call("POST", "/login", { email, code: "123456" });
    const badCodeUnknown = await client().call("POST", "/login", { email: unknown, code: "123456" });
    expect([badCodeKnown.status, badCodeKnown.body]).toEqual([badCodeUnknown.status, badCodeUnknown.body]);
    const resetKnown = await client().call("POST", "/password/reset", { email, code: "123456", newPassword: password });
    const resetUnknown = await client().call("POST", "/password/reset", { email: unknown, code: "123456", newPassword: password });
    expect([resetKnown.status, resetKnown.body]).toEqual([resetUnknown.status, resetUnknown.body]);
  });
  it("takes similar time for a wrong password and an unknown email", async () => {
    const { email } = await signUp(); const unknown = newEmail("ghost");
    const time = async (address: string) => { const start = performance.now(); await client().call("POST", "/login", { email: address, password: "not-the-password-1" }); return performance.now() - start; };
    const known: number[] = [], missing: number[] = [];
    for (let i = 0; i < 6; i++) { known.push(await time(email)); missing.push(await time(unknown)); }
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const ratio = median(known) / median(missing);
    expect(ratio).toBeGreaterThan(0.5); expect(ratio).toBeLessThan(2);
  });
});

describe("AU-05 codes: 6 digits, purpose-bound, 10 minutes, 5 attempts, single use, 60 s cooldown", () => {
  it("emails a six-digit code and stores only an HMAC of it", async () => {
    const email = newEmail("hmac"); const code = await requestCode(client(), email, "signup");
    expect(code).toMatch(/^\d{6}$/);
    const row = (await pool.query("SELECT code_hmac FROM otp_codes WHERE email_normalized=$1", [email.toLowerCase()])).rows[0];
    expect(row.code_hmac).toMatch(/^[0-9a-f]{64}$/); expect(row.code_hmac).not.toContain(code);
  });
  it("rejects a code used for the wrong purpose", async () => {
    const { email } = await signUp(); await expireCooldown(email);
    const c = client(); const resetCode = await requestCode(c, email, "reset");
    expect((await c.call("POST", "/login", { email, code: resetCode })).body).toMatchObject({ error: { code: "OTP_INVALID" } });
    expect((await c.call("POST", "/password/reset", { email, code: resetCode, newPassword: password })).status).toBe(200);
  });
  it("rejects a reused code", async () => {
    const { email } = await signUp(); const c = client(); const code = await requestCode(c, email, "login");
    expect((await c.call("POST", "/login", { email, code })).status).toBe(200);
    expect((await client().call("POST", "/login", { email, code })).body).toMatchObject({ error: { code: "OTP_INVALID" } });
  });
  it("locks a code after five wrong attempts, even if the sixth is correct", async () => {
    const { email } = await signUp(); const c = client(); const code = await requestCode(c, email, "login");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await client().call("POST", "/login", { email, code: wrong })).status).toBe(400);
    expect((await c.call("POST", "/login", { email, code })).body).toMatchObject({ error: { code: "OTP_INVALID" } });
    const attempts = (await pool.query("SELECT attempts FROM otp_codes WHERE email_normalized=$1 AND purpose='login'", [email.toLowerCase()])).rows[0].attempts;
    expect(attempts).toBe(5);
  });
  it("rejects an expired code", async () => {
    const { email } = await signUp(); const c = client(); const code = await requestCode(c, email, "login");
    await pool.query("UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE email_normalized=$1 AND purpose='login'", [email.toLowerCase()]);
    expect((await c.call("POST", "/login", { email, code })).status).toBe(400);
  });
  it("enforces a 60 second resend cooldown with Retry-After", async () => {
    const email = newEmail("cool"); const c = client(); await requestCode(c, email, "signup");
    const again = await c.call("POST", "/otp/request", { email, purpose: "signup" });
    expect(again.status).toBe(429); expect(again.headers.get("retry-after")).toBe("60");
    expect(again.body).toMatchObject({ error: { code: "OTP_RATE_LIMITED" } });
  });
  it("caps codes per email per hour", async () => {
    const email = newEmail("cap");
    for (let i = 0; i < 10; i++) { await expireCooldown(email); expect((await client().call("POST", "/otp/request", { email, purpose: "signup" })).status).toBe(202); }
    await expireCooldown(email);
    expect((await client().call("POST", "/otp/request", { email, purpose: "signup" })).status).toBe(429);
  });
});

describe("AU-06 sessions are hashed, revocable and use safe cookies", () => {
  it("logout invalidates the session server-side and clears the cookie", async () => {
    const { c } = await signUp(); const token = c.cookie!;
    const out = await c.call("POST", "/logout");
    expect(out.status).toBe(204); expect(out.setCookie).toMatch(/bayana_session=;/);
    const replay = client(); replay.cookie = token;
    expect((await replay.call("GET", "/me")).status).toBe(401);
  });
});

describe("AU-07 password reset by code revokes all sessions", () => {
  it("makes every old session return 401", async () => {
    const { email, c: laptop } = await signUp(); const phone = client();
    expect((await phone.call("POST", "/login", { email, password })).status).toBe(200);
    const resetter = client(); const code = await requestCode(resetter, email, "reset");
    expect((await resetter.call("POST", "/password/reset", { email, code, newPassword: "a-brand-new-password-3" })).status).toBe(200);
    expect((await laptop.call("GET", "/me")).status).toBe(401); expect((await phone.call("GET", "/me")).status).toBe(401);
    expect((await resetter.call("GET", "/me")).status).toBe(200);
    expect((await client().call("POST", "/login", { email, password })).status).toBe(401);
    expect((await client().call("POST", "/login", { email, password: "a-brand-new-password-3" })).status).toBe(200);
  });
});

describe("AU-08 sessions can be listed and revoked", () => {
  it("lists the account's sessions and revokes one", async () => {
    const { email, c: laptop } = await signUp(); const phone = client();
    await phone.call("POST", "/login", { email, password });
    const list = await laptop.call("GET", "/sessions");
    const sessions = list.body.sessions as { id: string; current: boolean }[];
    expect(sessions).toHaveLength(2); expect(sessions.filter(session => session.current)).toHaveLength(1);
    const other = sessions.find(session => !session.current)!;
    expect((await laptop.call("DELETE", `/sessions/${other.id}`)).status).toBe(204);
    expect((await phone.call("GET", "/me")).status).toBe(401); expect((await laptop.call("GET", "/me")).status).toBe(200);
  });
  it("cannot revoke another account's session", async () => {
    const a = await signUp(); const b = await signUp();
    const bSession = ((await b.c.call("GET", "/sessions")).body.sessions as { id: string }[])[0];
    expect((await a.c.call("DELETE", `/sessions/${bSession.id}`)).status).toBe(404);
    expect((await b.c.call("GET", "/me")).status).toBe(200);
  });
});

describe("AU-09 rate limits on auth endpoints", () => {
  it("returns 429 with Retry-After for a burst of 20 sign-in attempts", async () => {
    const c = client(); const email = newEmail("burst"); const statuses: number[] = []; let last: Reply | undefined;
    for (let i = 0; i < 20; i++) { last = await c.call("POST", "/login", { email, password: "not-the-password-1" }); statuses.push(last.status); }
    expect(statuses).toContain(429); expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(last!.body).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});

describe("migration compatibility", () => {
  it("accepts a legacy argon2 password set before this phase", async () => {
    const email = newEmail("old"); await pool.query("INSERT INTO users(id,email,role,password_hash) VALUES($1,$2,'VENDOR',$3)", [randomUUID(), email, await hashPassword(password)]);
    expect((await client().call("POST", "/login", { email, password })).status).toBe(200);
  });
});
