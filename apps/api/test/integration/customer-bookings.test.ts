import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { tokenHash } from "../../src/booking-links.js";
import { pool, transaction } from "../../src/database.js";
import { capturedEmails } from "../../src/email.js";
import { createUser } from "../helpers.js";

// Customers stay signed in (a persistent session), see only their own bookings at /my-bookings, and every booking email
// carries a private link that opens that one booking read-only.
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

const ip = () => `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
type Reply = { status: number; body: Record<string, any>; setCookie: string };
async function call(method: string, path: string, options: { cookie?: string; body?: unknown; token?: string; from?: string; key?: boolean } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", "x-forwarded-for": options.from ?? ip(), ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-booking-token": options.token } : {}), ...(options.key ? { "idempotency-key": randomUUID() } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, setCookie: response.headers.getSetCookie().join("\n") };
}
const sessionCookie = (reply: Reply) => { const value = /bayana_session=([^;]+)/.exec(reply.setCookie)?.[1]; return value ? `bayana_session=${value}` : undefined; };
/** Codes are sent after the response (and scrubbed from the outbox once sent): read the newest from the in-memory capture. */
async function codeFor(email: string, since: number) {
  for (let tries = 0; tries < 100; tries++) {
    const code = /\b(\d{6})\b/.exec(capturedEmails().slice(since).reverse().find(item => item.to === email)?.text ?? "")?.[1];
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`No code emailed to ${email}`);
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;
/** A UTC calendar date `offset` days from today (inside the 365-day window; never a date written into the test). */
const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function vendor() {
  const owner = await createUser(pool); const vendorId = randomUUID(), serviceId = randomUUID(), slug = `cust-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Customer test','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Pay on the day.',false)", [vendorId, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value,cancellation_tiers) VALUES($1,$2,'Portrait',150000,60,'hourly','NONE',0,'[{\"min_hours_before\":24,\"refund_percent\":100}]')", [serviceId, vendorId]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), vendorId, weekday]);
  return { slug, serviceId, ownerId: owner.id };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
/** A held, then agreed booking (no advance, so it is confirmed), for the customer signed in with `cookie`. */
async function book(v: Vendor, cookie: string, offset: number, hour = "04:30") {
  const date = isoDay(offset);
  const held = await call("POST", "/v1/bookings", { cookie, key: true, body: { slug: v.slug, date, service_id: v.serviceId, starts_at: `${date}T${hour}:00.000Z`, name: "Meera Shah" } });
  expect(held.status, JSON.stringify(held.body)).toBe(201);
  const id = held.body.booking.id as string;
  const view = await call("GET", `/v1/bookings/${id}`, { cookie });
  const accepted = await call("POST", `/v1/bookings/${id}/accept`, { cookie, body: { terms_hash: view.body.contract_preview.sha256, accepted: true } });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  return { id, holdToken: held.body.booking.access_token as string };
}
const customer = async () => { const user = await createUser(pool, { role: "CLIENT" }); await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [user.id]); return { ...user, cookie: await sessionFor(user.id) }; };
/**
 * The private link in a booking's email of one template. The outbox wipes a body once the email is sent, so it is read there
 * while queued, else from the in-memory copy of the sent email (matched by its subject).
 */
async function emailedToken(bookingId: string, template: string, subject: RegExp) {
  const link = new RegExp(`/b/${bookingId}\\?t=([A-Za-z0-9_%-]+)`);
  for (let tries = 0; tries < 100; tries++) {
    const row = (await pool.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE booking_id=$1 AND template=$2 ORDER BY created_at DESC LIMIT 1", [bookingId, template])).rows[0];
    const found = link.exec(row?.text_body ?? "") ?? link.exec(capturedEmails().filter(item => subject.test(item.subject)).map(item => item.text).find(text => link.test(text)) ?? "");
    if (found) return decodeURIComponent(found[1]);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`no ${template} link for ${bookingId}`);
}

describe("a customer stays signed in", () => {
  it("the booking email code starts a persistent session (Max-Age), which a new visit with the stored cookie still uses, and /me renews it", async () => {
    const email = `persist-${randomUUID().slice(0, 8)}@example.test`, from = ip(), since = capturedEmails().length;
    expect((await call("POST", "/v1/auth/booking/otp/request", { from, body: { email } })).status).toBe(202);
    const code = await codeFor(email, since);
    const verified = await call("POST", "/v1/auth/booking/otp/verify", { from, body: { email, code } });
    expect(verified.status).toBe(200);
    // A cookie with Max-Age outlives the browser; without it, it would die when the browser closes.
    expect(verified.setCookie).toMatch(/bayana_session=[^;]+; Max-Age=2592000; Path=\/; Expires=[^;]+; HttpOnly; SameSite=Lax/);
    const cookie = sessionCookie(verified)!;
    // "Browser restart": a brand-new request that only carries the stored cookie.
    const later = await call("GET", "/v1/auth/me", { cookie });
    expect(later.body.user).toMatchObject({ email, role: "CLIENT" });
    expect(later.setCookie).toMatch(/bayana_session=[^;]+; Max-Age=2592000/);
    expect((await call("GET", "/v1/client/bookings", { cookie })).status).toBe(200);
  });
  it("logging out revokes the session: the stored cookie no longer works", async () => {
    const c = await customer();
    expect((await call("POST", "/v1/auth/logout", { cookie: c.cookie })).status).toBe(204);
    expect((await call("GET", "/v1/auth/me", { cookie: c.cookie })).status).toBe(401);
    expect((await call("GET", "/v1/client/bookings", { cookie: c.cookie })).status).toBe(401);
  });
});

describe("My bookings: only your own, in time order", () => {
  it("lists the signed-in customer's bookings (upcoming in order, with terms and amounts) and never another customer's", async () => {
    const v = await vendor(); const me = await customer(), other = await customer();
    const later = await book(v, me.cookie, 30), sooner = await book(v, me.cookie, 10), theirs = await book(v, other.cookie, 20);
    const list = (await call("GET", "/v1/client/bookings", { cookie: me.cookie })).body.bookings as { id: string; terms_accepted_at: string | null; total_paise: string; balance_due_paise: string }[];
    expect(list.map(row => row.id)).toEqual([sooner.id, later.id]);
    expect(list[0].terms_accepted_at).not.toBeNull(); expect(Number(list[0].total_paise)).toBe(150000);
    // Another customer's booking: the same 404 as one that does not exist.
    expect((await call("GET", `/v1/bookings/${theirs.id}`, { cookie: me.cookie })).status).toBe(404);
    expect((await call("POST", `/v1/bookings/${theirs.id}/cancel`, { cookie: me.cookie, body: {} })).status).toBe(404);
  });
  it("an account that is both a vendor and a customer sees its customer bookings too", async () => {
    const v = await vendor(); const me = await customer(); const made = await book(v, me.cookie, 12);
    await pool.query("UPDATE users SET role='VENDOR' WHERE id=$1", [me.id]);
    expect(((await call("GET", "/v1/client/bookings", { cookie: me.cookie })).body.bookings as { id: string }[]).map(row => row.id)).toEqual([made.id]);
  });
  it("customer sessions cannot reach vendor, dashboard or admin routes", async () => {
    const me = await customer();
    // Admin routes answer 404 to anyone who is not an admin (they do not reveal that they exist).
    for (const path of ["/v1/vendor/me", "/v1/vendor/bookings", "/v1/vendor/overview", "/v1/vendor/services", "/v1/admin/health", "/v1/admin/bookings"]) expect([401, 403, 404], path).toContain((await call("GET", path, { cookie: me.cookie })).status);
  });
  it("a vendor sees only their own customers' bookings", async () => {
    const a = await vendor(), b = await vendor(); const me = await customer(); const made = await book(a, me.cookie, 14);
    expect((await call("GET", `/v1/bookings/${made.id}`, { cookie: await sessionFor(a.ownerId) })).body.viewer).toBe("vendor");
    expect((await call("GET", `/v1/bookings/${made.id}`, { cookie: await sessionFor(b.ownerId) })).status).toBe(404);
  });
});

describe("the private link in every booking email", () => {
  it("opens that one booking read-only without signing in; changing it needs sign-in; a tampered or borrowed token is refused", async () => {
    const v = await vendor(); const me = await customer();
    const first = await book(v, me.cookie, 16), second = await book(v, me.cookie, 18);
    const token = await emailedToken(first.id, "booking_confirmed_customer", /^Confirmed:/);
    const opened = await call("GET", `/v1/bookings/${first.id}`, { token });
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({ id: first.id, read_only: true, can_cancel: false, can_pay: false, contract_preview: null });
    expect((await call("POST", `/v1/bookings/${first.id}/cancel`, { token, body: {} })).status).toBe(401);
    // Tampered, or the right token on another booking: the same 404.
    expect((await call("GET", `/v1/bookings/${first.id}`, { token: `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}` })).status).toBe(404);
    expect((await call("GET", `/v1/bookings/${second.id}`, { token })).status).toBe(404);
    // Stored only as a hash.
    expect((await pool.query("SELECT 1 FROM booking_access_tokens WHERE token_hash=$1", [token])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM booking_access_tokens WHERE token_hash=$1 AND booking_id=$2", [tokenHash(token), first.id])).rowCount).toBe(1);
    // The hold's own link still finishes and changes the booking, as before.
    expect((await call("GET", `/v1/bookings/${first.id}`, { token: first.holdToken })).body.read_only).toBe(false);
  });
  it("the cancellation email has its own working link, and erasing the customer's data turns every link off", async () => {
    const v = await vendor(); const me = await customer(); const made = await book(v, me.cookie, 20);
    const confirmed = await emailedToken(made.id, "booking_confirmed_customer", /^Confirmed:/);
    expect((await call("POST", `/v1/bookings/${made.id}/cancel`, { cookie: me.cookie, body: { reason: "Plans changed" } })).status).toBe(200);
    const cancelled = await emailedToken(made.id, "booking_cancelled", /^Cancelled:/);
    expect(cancelled).not.toBe(confirmed);
    expect((await call("GET", `/v1/bookings/${made.id}`, { token: cancelled })).body.status).toBe("CANCELLED");
    expect((await call("POST", "/v1/client/delete", { cookie: me.cookie, body: { confirm: "DELETE" } })).status).toBe(204);
    for (const token of [confirmed, cancelled, made.holdToken]) expect((await call("GET", `/v1/bookings/${made.id}`, { token })).status).toBe(404);
  });
  it("the link route is rate limited per client", async () => {
    const from = ip(); const statuses: number[] = [];
    for (let attempt = 0; attempt < 125; attempt++) statuses.push((await call("GET", `/v1/bookings/${randomUUID()}`, { from, token: "guess" })).status);
    expect(statuses.filter(status => status === 429).length).toBeGreaterThan(0);
  });
});
