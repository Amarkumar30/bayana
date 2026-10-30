import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POLICY_VERSIONS } from "@bayana/shared";
import { app } from "../../src/app.js";
import { hashPassword, startSession } from "../../src/auth.js";
import { config } from "../../src/config.js";
import { pool, transaction } from "../../src/database.js";
import { capturedEmails } from "../../src/email.js";
import { FakeGoogleProvider, useTestGoogle } from "../../src/google/provider.js";
import { bookingReturnPath } from "@bayana/shared";
import { createUser } from "../helpers.js";

// Google sign-in (AU-02, SPEC 12.1) and passwordless-first auth (AU-01), with FakeGoogleProvider: real RS256 ID tokens signed
// by a local key, no network. The real Google round trip is the user's manual step (docs/GOOGLE_SETUP.md).
let server: ReturnType<typeof app.listen>; let base = ""; let fake: FakeGoogleProvider;
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
beforeEach(async () => { fake = await new FakeGoogleProvider().init(); useTestGoogle(fake); });
afterAll(async () => { useTestGoogle(undefined); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

const web = config.WEB_ORIGINS[0];
const ip = () => `10.55.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const cookieValue = (setCookie: string, name: string) => new RegExp(`${name}=([^;]*)`).exec(setCookie)?.[1];
type Raw = { status: number; location: string; setCookie: string; body: Record<string, any> };
async function raw(method: string, path: string, options: { cookie?: string; body?: unknown; from?: string } = {}): Promise<Raw> {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", "x-forwarded-for": options.from ?? ip(), ...(options.cookie ? { cookie: options.cookie } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, location: response.headers.get("location") ?? "", setCookie: response.headers.getSetCookie().join("; "), body };
}

/** GET /start, then what Google would hand back for this person. */
async function start(options: { next?: string; session?: string; mode?: "link"; intent?: string } = {}) {
  const query = new URLSearchParams({ ...(options.next !== undefined ? { next: options.next } : {}), ...(options.mode ? { mode: options.mode } : {}), ...(options.intent !== undefined ? { intent: options.intent } : {}) });
  const reply = await raw("GET", `/v1/auth/google/start${query.size ? `?${query}` : ""}`, { cookie: options.session });
  expect(reply.status, JSON.stringify(reply.body)).toBe(302);
  const google = new URL(reply.location);
  return { state: google.searchParams.get("state")!, nonce: google.searchParams.get("nonce")!, challenge: google.searchParams.get("code_challenge")!, cookie: `bayana_google=${cookieValue(reply.setCookie, "bayana_google")}`, setCookie: reply.setCookie };
}
type Person = { sub: string; email: string };
const person = (email = `g-${randomUUID().slice(0, 8)}@gmail.test`): Person => ({ sub: `google-${randomUUID()}`, email });
async function callback(flow: Awaited<ReturnType<typeof start>>, who: Person, claims: Partial<Parameters<FakeGoogleProvider["issueCode"]>[0]> = {}, extra: { session?: string; state?: string; cookie?: string | null } = {}) {
  const code = fake.issueCode({ ...who, nonce: flow.nonce, codeChallenge: flow.challenge, ...claims });
  const cookies = [extra.cookie === null ? undefined : extra.cookie ?? flow.cookie, extra.session].filter(Boolean).join("; ");
  return raw("GET", `/v1/auth/google/callback?state=${encodeURIComponent(extra.state ?? flow.state)}&code=${code}`, { cookie: cookies || undefined });
}
const session = (reply: Raw) => { const value = cookieValue(reply.setCookie, "bayana_session"); return value ? `bayana_session=${value}` : undefined; };
const me = async (cookie?: string) => (await raw("GET", "/v1/auth/me", { cookie })).body.user as { id: string; email: string; role: string } | undefined;
const identities = async (email: string) => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM auth_identities WHERE email_at_link=$1", [email])).rows[0].n;
const usersWith = async (email: string) => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE email_normalized=$1", [email.toLowerCase()])).rows[0].n;

describe("Google sign-in: account rules", () => {
  it("a new person gets one vendor account with a verified email and no password, and is sent to onboarding", async () => {
    const who = person(); const flow = await start();
    expect(flow.setCookie).toMatch(/bayana_google=[^;]+; Max-Age=600; Path=\/v1\/auth\/google;.*HttpOnly/i);
    expect(flow.setCookie).toMatch(/SameSite=Lax/i);
    const reply = await callback(flow, who);
    expect(reply.location).toBe(`${web}/onboarding`);
    const user = await me(session(reply));
    expect(user).toMatchObject({ email: who.email, role: "VENDOR" });
    const row = (await pool.query("SELECT password_hash,email_verified_at FROM users WHERE id=$1", [user!.id])).rows[0];
    expect(row.password_hash).toBeNull(); expect(row.email_verified_at).not.toBeNull();
    expect(await identities(who.email)).toBe(1);
    // No tokens are kept: the identity row holds only the subject and the email at link time.
    expect(Object.keys((await pool.query("SELECT * FROM auth_identities WHERE email_at_link=$1", [who.email])).rows[0]).sort()).toEqual(["created_at", "email_at_link", "id", "provider", "provider_subject", "user_id"]);
    // Joining through Google agrees to the current platform terms, vendor agreement and privacy policy (PV-01).
    const consents = (await pool.query("SELECT kind,policy_version,source FROM consents WHERE user_id=$1 ORDER BY kind", [user!.id])).rows;
    expect(consents).toEqual((["account_terms", "privacy_policy", "vendor_terms"] as const).map(kind => ({ kind, policy_version: POLICY_VERSIONS[kind], source: "signup_google" })));
  });

  it("an existing email-code account is linked, not duplicated, and the next sign-in uses the identity", async () => {
    const existing = await createUser(pool, { email: `linked-${randomUUID().slice(0, 8)}@gmail.test` });
    const who = { sub: `google-${randomUUID()}`, email: existing.email };
    const first = await callback(await start({ next: "/dashboard/bookings" }), who);
    expect(first.location).toBe(`${web}/onboarding`); // no business profile yet, so setup comes first
    expect((await me(session(first)))!.id).toBe(existing.id);
    expect(await usersWith(existing.email)).toBe(1); expect(await identities(existing.email)).toBe(1);
    await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value) VALUES($1,$2,$3,'G Studio','Pune','',100,'PERCENT',1)", [randomUUID(), existing.id, `g-${randomUUID().slice(0, 8)}`]);
    // The second time, the Google subject finds the user even if the Google email changed.
    const second = await callback(await start({ next: "/dashboard/bookings" }), { sub: who.sub, email: `renamed-${who.email}` });
    expect(second.location).toBe(`${web}/dashboard/bookings`);
    expect((await me(session(second)))!.id).toBe(existing.id);
    expect(await usersWith(existing.email)).toBe(1);
  });

  it("a second Google account cannot be linked to a user who already has one", async () => {
    const who = person(); await callback(await start(), who);
    const other = { sub: `google-${randomUUID()}`, email: who.email };
    const reply = await callback(await start(), other);
    expect(reply.location).toBe(`${web}/login?error=google_other_account`);
    expect(session(reply)).toBeUndefined();
    expect(await identities(who.email)).toBe(1);
  });

  it("every sign-in starts a new session and revokes the one the browser had", async () => {
    const who = person(); const first = session(await callback(await start(), who))!;
    const second = await callback(await start(), who, {}, { session: first });
    const fresh = session(second)!;
    expect(fresh).not.toBe(first);
    expect(await me(first)).toBeUndefined();
    expect((await me(fresh))!.email).toBe(who.email);
  });
});

describe("Google sign-in: what must fail", () => {
  it("access_denied (the person pressed cancel) goes back to the login page with a friendly code", async () => {
    const flow = await start();
    const reply = await raw("GET", `/v1/auth/google/callback?error=access_denied&state=${flow.state}`, { cookie: flow.cookie });
    expect(reply.location).toBe(`${web}/login?error=google_cancelled`);
    expect(reply.setCookie).toMatch(/bayana_google=;/);
  });

  it("state mismatch, missing cookie and tampered cookie are refused without signing in", async () => {
    const who = person(); const flow = await start();
    expect((await callback(flow, who, {}, { state: "not-the-state" })).location).toBe(`${web}/login?error=google_failed`);
    const flow2 = await start();
    const missing = await callback(flow2, who, {}, { cookie: null });
    expect(missing.location).toBe(`${web}/login?error=google_expired`); expect(session(missing)).toBeUndefined();
    const flow3 = await start();
    expect((await callback(flow3, who, {}, { cookie: `${flow3.cookie.slice(0, -3)}AAA` })).location).toBe(`${web}/login?error=google_expired`);
    expect(await usersWith(who.email)).toBe(0);
  });

  it("a replayed callback fails even with the original cookie", async () => {
    const who = person(); const flow = await start();
    const code = fake.issueCode({ ...who, nonce: flow.nonce, codeChallenge: flow.challenge });
    const url = `/v1/auth/google/callback?state=${flow.state}&code=${code}`;
    expect((await raw("GET", url, { cookie: flow.cookie })).location).toBe(`${web}/onboarding`);
    const replay = await raw("GET", url, { cookie: flow.cookie });
    expect(replay.location).toBe(`${web}/login?error=google_expired`);
    expect(session(replay)).toBeUndefined();
  });

  it("nonce mismatch, wrong audience, wrong issuer, expired token and an unverified email are all refused", async () => {
    const cases: [Partial<Parameters<FakeGoogleProvider["issueCode"]>[0]>, string][] = [
      [{ nonce: "someone-elses-nonce" }, "google_failed"], [{ aud: "other-app.apps.googleusercontent.com" }, "google_failed"], [{ iss: "https://evil.example" }, "google_failed"],
      [{ expiresInSeconds: -120 }, "google_failed"], [{ email_verified: false }, "google_unverified"]
    ];
    for (const [claims, code] of cases) {
      const who = person();
      const reply = await callback(await start(), who, claims);
      expect(reply.location, JSON.stringify(claims)).toBe(`${web}/login?error=${code}`);
      expect(session(reply)).toBeUndefined();
      expect(await usersWith(who.email)).toBe(0);
    }
  });

  it("a wrong PKCE verifier fails the code exchange", async () => {
    const who = person(); const flow = await start();
    const reply = await callback(flow, who, { codeChallenge: "a-different-challenge" });
    expect(reply.location).toBe(`${web}/login?error=google_failed`);
  });

  it("open redirects are refused: only relative paths into the app", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "/dashboard/../../evil", "javascript:alert(1)", "/login", "/dashboard?x=https://evil.example", "/b/123"]) {
      const reply = await raw("GET", `/v1/auth/google/start?next=${encodeURIComponent(next)}`);
      expect(reply.status, next).toBe(400); expect(reply.body.error.code).toBe("INVALID_NEXT");
    }
    expect((await raw("GET", "/v1/auth/google/start?next=%2Fadmin%2Fbookings")).status).toBe(302);
  });

  it("with no client id the feature is off: providers says so and start is a clean 404", async () => {
    useTestGoogle(null);
    expect((await raw("GET", "/v1/auth/providers")).body).toEqual({ google: false });
    const reply = await raw("GET", "/v1/auth/google/start");
    expect(reply.status).toBe(404); expect(reply.body.error.code).toBe("GOOGLE_DISABLED");
    useTestGoogle(fake);
    expect((await raw("GET", "/v1/auth/providers")).body).toEqual({ google: true });
  });

  it("start and callback are rate limited per client", async () => {
    const from = ip(); const statuses: number[] = [];
    for (let attempt = 0; attempt < 32; attempt++) statuses.push((await raw("GET", "/v1/auth/google/start", { from })).status);
    expect(statuses.filter(status => status === 429).length).toBeGreaterThan(0);
  });
});

describe("Settings: sign-in methods", () => {
  const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;

  it("connect Google from settings links to the signed-in account; another person's Google account is refused", async () => {
    const user = await createUser(pool); await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [user.id]);
    const cookie = await sessionFor(user.id);
    expect((await raw("GET", "/v1/auth/google/start?mode=link")).status).toBe(401);
    const google = person();
    const linked = await callback(await start({ mode: "link", session: cookie }), google, {}, { session: cookie });
    expect(linked.location).toBe(`${web}/dashboard/settings?google=connected`);
    expect((await raw("GET", "/v1/auth/methods", { cookie })).body).toMatchObject({ email_code: true, password: { set: false }, google: { available: true, connected: true, email: google.email } });
    // Someone else's Google account (already linked to a different user) cannot be attached here.
    const owner = person(); await callback(await start(), owner);
    const other = await createUser(pool); await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [other.id]);
    const otherCookie = await sessionFor(other.id);
    expect((await callback(await start({ mode: "link", session: otherCookie }), owner, {}, { session: otherCookie })).location).toBe(`${web}/dashboard/settings?error=google_in_use`);
  });

  it("disconnecting Google works while another method remains, and the last method can never be removed", async () => {
    const who = person(); const reply = await callback(await start(), who); const cookie = session(reply)!;
    expect((await raw("DELETE", "/v1/auth/google", { cookie })).status).toBe(204);
    expect((await raw("GET", "/v1/auth/methods", { cookie })).body.google.connected).toBe(false);
    // A Google-only account whose address was never verified any other way: Google is its only way in.
    const lone = person(); const loneCookie = session(await callback(await start(), lone))!;
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE email_normalized=$1", [lone.email]);
    const refused = await raw("DELETE", "/v1/auth/google", { cookie: loneCookie });
    expect(refused.status).toBe(409); expect(refused.body.error.code).toBe("LAST_SIGN_IN_METHOD");
    expect((await raw("GET", "/v1/auth/methods", { cookie: loneCookie })).body.google.connected).toBe(true);
  });

  it("setting, changing and removing a password signs out other devices; changing needs the current one", async () => {
    const user = await createUser(pool); await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [user.id]);
    const here = await sessionFor(user.id), elsewhere = await sessionFor(user.id);
    expect((await raw("PUT", "/v1/auth/password", { cookie: here, body: { new_password: "short" } })).status).toBe(400);
    expect((await raw("PUT", "/v1/auth/password", { cookie: here, body: { new_password: "lantern-harbour-violet-7" } })).status).toBe(200);
    expect(await me(elsewhere)).toBeUndefined(); expect(await me(here)).toBeDefined();
    expect((await raw("PUT", "/v1/auth/password", { cookie: here, body: { current_password: "wrong-password-1", new_password: "another-good-pass-8" } })).status).toBe(401);
    const third = await sessionFor(user.id);
    expect((await raw("PUT", "/v1/auth/password", { cookie: here, body: { current_password: "lantern-harbour-violet-7", new_password: "another-good-pass-8" } })).status).toBe(200);
    expect(await me(third)).toBeUndefined();
    expect((await raw("POST", "/v1/auth/login", { body: { email: user.email, password: "another-good-pass-8" } })).status).toBe(200);
    expect((await raw("DELETE", "/v1/auth/password", { cookie: here, body: { current_password: "another-good-pass-8" } })).body).toEqual({ password: { set: false } });
    expect((await raw("POST", "/v1/auth/login", { body: { email: user.email, password: "another-good-pass-8" } })).status).toBe(401);
  });
});

describe("passwordless-first (AU-01, AU-02)", () => {
  const codeFor = async (email: string, since: number) => {
    for (let tries = 0; tries < 100; tries++) { const message = capturedEmails().slice(since).reverse().find(item => item.to.toLowerCase() === email); const code = message ? /\b(\d{6})\b/.exec(message.text)?.[1] : undefined; if (code) return code; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw new Error("no code");
  };
  it("signup with only an email code creates the account; no password is needed", async () => {
    const email = `nopass-${randomUUID().slice(0, 8)}@example.test`, from = ip(), since = capturedEmails().length;
    expect((await raw("POST", "/v1/auth/otp/request", { from, body: { email, purpose: "signup" } })).status).toBe(202);
    const signup = await raw("POST", "/v1/auth/signup", { from, body: { email, code: await codeFor(email, since) } });
    expect(signup.status).toBe(201); expect(signup.body.user).toMatchObject({ email, role: "VENDOR" });
    expect((await pool.query("SELECT password_hash FROM users WHERE email_normalized=$1", [email])).rows[0].password_hash).toBeNull();
  });

  it("password login on an account without a password gives the same answer as a wrong password, in similar time", async () => {
    const nopass = await createUser(pool); const withPass = await createUser(pool);
    await pool.query("UPDATE users SET password_hash=$2 WHERE id=$1", [withPass.id, await hashPassword("the-right-password-1")]);
    const timed = async (email: string) => { const started = performance.now(); const reply = await raw("POST", "/v1/auth/login", { body: { email, password: "a-wrong-password-2" } }); return { reply, ms: performance.now() - started }; };
    const a = await timed(nopass.email), b = await timed(withPass.email);
    expect(a.reply.status).toBe(401); expect(b.reply.status).toBe(401);
    expect(a.reply.body).toEqual(b.reply.body);
    expect(Math.abs(a.ms - b.ms)).toBeLessThan(Math.max(a.ms, b.ms) * 0.75 + 50);
  });
});

// ---- Customers: Google instead of the booking email code (intent=customer) -------------------------------------------------
/** A published vendor open every day 09:00-18:00 with one 60-minute service, so a verified customer can hold a time. */
async function bookable() {
  const owner = await createUser(pool); const vendorId = randomUUID(), serviceId = randomUUID(), slug = `gcust-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Google test','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'The advance confirms the time.',false)", [vendorId, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Portrait',150000,60,'hourly','NONE',0)", [serviceId, vendorId]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), vendorId, weekday]);
  const date = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10), startsAt = `${date}T04:30:00.000Z`;
  return { slug, serviceId, date, startsAt, next: bookingReturnPath({ slug, service: serviceId, date, start: startsAt, blocks: 1 }) };
}
const hold = (cookie: string | undefined, v: Awaited<ReturnType<typeof bookable>>) => fetch(`${base}/v1/bookings`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "x-forwarded-for": ip(), "idempotency-key": randomUUID(), ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ slug: v.slug, date: v.date, service_id: v.serviceId, starts_at: v.startsAt, name: "Meera Shah" }) });
const userRow = async (email: string) => (await pool.query<{ id: string; role: string; password_hash: string | null; email_verified_at: Date | null }>("SELECT id,role,password_hash,email_verified_at FROM users WHERE email_normalized=$1", [email.toLowerCase()])).rows;

describe("Google for customers (intent=customer)", () => {
  it("start: intent defaults to vendor; an unknown intent, a non-booking return or connecting as a customer is refused", async () => {
    const v = await bookable();
    const vendorDefault = await callback(await start(), person());
    expect(vendorDefault.location).toBe(`${web}/onboarding`);
    for (const query of ["intent=admin", "intent=customer", "intent=customer&next=%2Fdashboard", `intent=customer&mode=link&next=${encodeURIComponent(v.next)}`, `intent=customer&next=${encodeURIComponent(`//evil.example${v.next}`)}`]) {
      const reply = await raw("GET", `/v1/auth/google/start?${query}`);
      expect(reply.status, query).toBe(400); expect(["INVALID_INTENT", "INVALID_NEXT"]).toContain(reply.body.error.code);
    }
  });
  it("a new customer's verified Google email holds the booking with no email code, as a customer account that is never a vendor", async () => {
    const v = await bookable(); const who = person(); const codesBefore = (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM otp_codes")).rows[0].n;
    const reply = await callback(await start({ intent: "customer", next: v.next }), who);
    expect(reply.location).toBe(`${web}${v.next}`);
    const cookie = session(reply); const rows = await userRow(who.email);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ role: "CLIENT", password_hash: null }); expect(rows[0].email_verified_at).not.toBeNull();
    expect(await me(cookie)).toMatchObject({ email: who.email, role: "CLIENT" });
    // Never a vendor: no business profile, no vendor terms, no vendor area.
    expect((await pool.query("SELECT 1 FROM vendors WHERE owner_user_id=$1", [rows[0].id])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM consents WHERE user_id=$1 AND kind='vendor_terms'", [rows[0].id])).rowCount).toBe(0);
    expect([401, 403, 404]).toContain((await raw("GET", "/v1/vendor/me", { cookie })).status);
    // The booking continues without an OTP: no code was created, and the hold is in the Google-verified email's name.
    const held = await hold(cookie, v);
    expect(held.status).toBe(201);
    const booking = (await held.json() as { booking: { id: string } }).booking;
    expect((await pool.query("SELECT client_email::text AS email FROM bookings WHERE id=$1", [booking.id])).rows[0].email).toBe(who.email);
    expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM otp_codes")).rows[0].n).toBe(codesBefore);
    expect((await hold(undefined, v)).status).toBe(401);
  });
  it("the intent comes only from the signed cookie: a query string at the callback cannot turn a customer into a vendor", async () => {
    const v = await bookable(); const who = person(); const flow = await start({ intent: "customer", next: v.next });
    const code = fake.issueCode({ ...who, nonce: flow.nonce, codeChallenge: flow.challenge });
    const reply = await raw("GET", `/v1/auth/google/callback?state=${encodeURIComponent(flow.state)}&code=${code}&intent=vendor&next=%2Fdashboard`, { cookie: flow.cookie });
    expect(reply.location).toBe(`${web}${v.next}`);
    expect((await userRow(who.email))[0].role).toBe("CLIENT");
  });
  it("an email Google has not verified creates nothing and returns to the booking with a clear code", async () => {
    const v = await bookable(); const who = person();
    const reply = await callback(await start({ intent: "customer", next: v.next }), who, { email_verified: false });
    expect(reply.location).toBe(`${web}${v.next.replace("&google=1", "")}&google_error=google_unverified`);
    expect(session(reply)).toBeUndefined(); expect(await userRow(who.email)).toHaveLength(0); expect(await identities(who.email)).toBe(0);
  });
  it("the same email as an existing vendor signs in to that one row (any case) and keeps its role; holds stay for customer accounts", async () => {
    const v = await bookable(); const vendorUser = await createUser(pool);
    const who = { sub: `google-${randomUUID()}`, email: vendorUser.email.toUpperCase() };
    const reply = await callback(await start({ intent: "customer", next: v.next }), who);
    expect(reply.location).toBe(`${web}${v.next}`);
    expect(await usersWith(vendorUser.email)).toBe(1);
    expect(await me(session(reply))).toMatchObject({ id: vendorUser.id, role: "VENDOR" });
    expect((await hold(session(reply), v)).status).toBe(401);
  });
  it("a customer from the email-code path is the same row; becoming a vendor happens only through the vendor sign-in", async () => {
    const v = await bookable(); const client = await createUser(pool, { role: "CLIENT" }); const who = { sub: `google-${randomUUID()}`, email: client.email };
    const asCustomer = await callback(await start({ intent: "customer", next: v.next }), who);
    expect(await me(session(asCustomer))).toMatchObject({ id: client.id, role: "CLIENT" });
    const asVendor = await callback(await start(), who);
    expect(await me(session(asVendor))).toMatchObject({ id: client.id, role: "VENDOR" });
    expect(await usersWith(client.email)).toBe(1);
  });
  it("replayed state, wrong nonce, expired state and a missing cookie fail safely without signing in", async () => {
    const v = await bookable(); const who = person(); const back = `${web}${v.next.replace("&google=1", "")}`;
    const first = await start({ intent: "customer", next: v.next });
    expect((await callback(first, who)).location).toBe(`${web}${v.next}`);
    const replay = await callback(first, who);
    expect(replay.location).toBe(`${back}&google_error=google_expired`); expect(session(replay)).toBeUndefined();
    const nonce = await callback(await start({ intent: "customer", next: v.next }), person(), { nonce: "not-the-nonce" });
    expect(nonce.location).toBe(`${back}&google_error=google_failed`); expect(session(nonce)).toBeUndefined();
    const old = await start({ intent: "customer", next: v.next });
    await pool.query("UPDATE oauth_login_states SET created_at=now()-interval '11 minutes' WHERE state_hash=encode(sha256(convert_to('google-state:' || $1, 'UTF8')),'hex')", [old.state]);
    const expired = await callback(old, person());
    expect(expired.location).toBe(`${back}&google_error=google_expired`); expect(session(expired)).toBeUndefined();
    const noCookie = await callback(await start({ intent: "customer", next: v.next }), person(), {}, { cookie: null });
    expect(noCookie.location).toBe(`${web}/login?error=google_expired`); expect(session(noCookie)).toBeUndefined();
  });
});
