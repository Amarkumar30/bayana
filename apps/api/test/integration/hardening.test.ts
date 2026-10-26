import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { Router } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POLICY_VERSIONS } from "@bayana/shared";
import { adminRouter } from "../../src/admin-routes.js";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { bookingRouter } from "../../src/booking-routes.js";
import { config } from "../../src/config.js";
import { dashboardRouter, icalRouter } from "../../src/dashboard-routes.js";
import { pool, transaction } from "../../src/database.js";
import { capturedEmails } from "../../src/email.js";
import { createLogger, setLogger } from "../../src/logger.js";
import { FakeProvider } from "../../src/payments/fake-provider.js";
import { useTestPayments } from "../../src/payments/runtime.js";
import { privacyRouter } from "../../src/privacy.js";
import { vendorRouter } from "../../src/vendor-routes.js";
import { createUser } from "../helpers.js";

// Phase 10 hardening (SPEC 12, 18): CSRF origin check, API headers, consent rows (PV-01), customer export and erasure with
// an anonymised ledger (PV-02), an IDOR suite that covers every route with an id, and a scan of everything logged.
let server: ReturnType<typeof app.listen>; let base = ""; let fake: FakeProvider;
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
beforeEach(() => { fake = new FakeProvider(); useTestPayments({ mode: "test", provider: fake }); });
afterAll(async () => { useTestPayments(null); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; body: Record<string, any>; text: string; headers: Headers };
async function call(method: string, path: string, options: { cookie?: string; token?: string; body?: unknown; key?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", "x-forwarded-for": `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-booking-token": options.token } : {}), ...(options.key ? { "idempotency-key": options.key } : {}), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, text, headers: response.headers };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;
const day = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
const at = (time: string) => { const [h, m] = time.split(":").map(Number); return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m) - 330 * 60_000).toISOString(); };

async function vendor() {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `hard-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Hard Studio','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Session',100000,60,'TIMED','PERCENT',20)", [serviceId, id]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerId: owner.id, cookie: await sessionFor(owner.id) };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
/** A confirmed booking paid online (Rs 200 advance), with the customer's session and private token. */
async function confirmed(v: Vendor, time = "10:00", notes?: string) {
  const customer = await createUser(pool, { role: "CLIENT" }); await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [customer.id]);
  const cookie = await sessionFor(customer.id);
  const held = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: at(time), name: "Meena Iyer", ...(notes ? { notes } : {}) } });
  expect(held.status, held.text).toBe(201);
  const id = held.body.booking.id as string, token = held.body.booking.access_token as string;
  const view = await call("GET", `/v1/bookings/${id}`, { token });
  expect((await call("POST", `/v1/bookings/${id}/accept`, { token, body: { terms_hash: view.body.contract_preview.sha256, accepted: true } })).status).toBe(200);
  const order = await call("POST", `/v1/bookings/${id}/payment-order`, { token, body: {} });
  const paid = fake.pay(order.body.order_id);
  const verified = await call("POST", `/v1/bookings/${id}/payment-verify`, { token, body: { razorpay_order_id: paid.razorpay_order_id, razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: paid.razorpay_signature } });
  expect(verified.body.booking.status).toBe("CONFIRMED");
  return { id, token, customer, customerCookie: cookie, paymentId: verified.body.booking.payments[0].id as string };
}

describe("CSRF: origin check on state-changing requests", () => {
  it("refuses a foreign Origin or a cross-site fetch, allows our own origin and server-to-server calls", async () => {
    const v = await vendor();
    const body = { business_name: "Renamed Studio" };
    for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
      const reply = await call("PATCH", "/v1/vendor/me", { cookie: v.cookie, body, headers });
      expect(reply.status, JSON.stringify(headers)).toBe(403); expect(reply.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    }
    expect((await pool.query("SELECT display_name FROM vendors WHERE id=$1", [v.id])).rows[0].display_name).toBe("Hard Studio");
    expect((await call("PATCH", "/v1/vendor/me", { cookie: v.cookie, body, headers: { origin: config.WEB_ORIGINS[0], "sec-fetch-site": "same-site" } })).status).toBe(200);
    // Reads are not affected, and the job runner (Bearer secret, no Origin) still works.
    expect((await call("GET", "/v1/vendor/me", { cookie: v.cookie, headers: { origin: "https://evil.example" } })).status).toBe(200);
    expect((await call("POST", "/internal/jobs/tick", { headers: { authorization: "Bearer wrong", origin: "https://evil.example" } })).status).toBe(401);
  });

  it("the API answers with a JSON-only CSP and the usual hardening headers", async () => {
    const reply = await call("GET", "/health");
    expect(reply.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(reply.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(reply.headers.get("x-content-type-options")).toBe("nosniff");
    expect(reply.headers.get("x-powered-by")).toBeNull();
    expect(reply.headers.get("cross-origin-resource-policy")).toBe("same-site");
  });
});

describe("consent rows (PV-01)", () => {
  it("signup records the platform terms, vendor agreement and privacy policy versions; booking acceptance records the booking terms, platform terms, refund and privacy policies", async () => {
    const email = `consent-${randomUUID().slice(0, 8)}@example.test`, since = capturedEmails().length;
    await call("POST", "/v1/auth/otp/request", { body: { email, purpose: "signup" } });
    let code = "";
    for (let tries = 0; tries < 500 && !code; tries++) { code = /\b(\d{6})\b/.exec(capturedEmails().slice(since).find(item => item.to === email)?.text ?? "")?.[1] ?? ""; if (!code) await new Promise(resolve => setTimeout(resolve, 20)); }
    const signup = await call("POST", "/v1/auth/signup", { body: { email, code }, headers: { "user-agent": "ConsentTest/1.0" } });
    expect(signup.status).toBe(201);
    const rows = (await pool.query("SELECT kind,policy_version,source,user_agent FROM consents WHERE user_id=$1 ORDER BY kind", [signup.body.user.id])).rows;
    const signedUp = (kind: keyof typeof POLICY_VERSIONS) => ({ kind, policy_version: POLICY_VERSIONS[kind], source: "signup_email", user_agent: "ConsentTest/1.0" });
    expect(rows).toEqual([signedUp("account_terms"), signedUp("privacy_policy"), signedUp("vendor_terms")]);
    const booking = await confirmed(await vendor());
    const accepted = (await pool.query("SELECT kind,policy_version,source FROM consents WHERE booking_id=$1 ORDER BY kind", [booking.id])).rows;
    expect(accepted).toEqual((["account_terms", "booking_terms", "privacy_policy", "refund_policy"] as const).map(kind => ({ kind, policy_version: POLICY_VERSIONS[kind], source: "booking_accept" })));
    await expect(pool.query("UPDATE consents SET policy_version='x' WHERE booking_id=$1", [booking.id])).rejects.toThrow();
  });
});

describe("customer export and erasure (PV-02)", () => {
  it("export returns the customer's bookings, payments, contracts and consents", async () => {
    const booking = await confirmed(await vendor());
    const exported = await call("GET", "/v1/client/export", { cookie: booking.customerCookie });
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    expect(exported.body.bookings.map((row: { id: string }) => row.id)).toContain(booking.id);
    expect(exported.body.payments).toHaveLength(1); expect(exported.body.contracts).toHaveLength(1);
    expect((await call("GET", "/v1/client/export")).status).toBe(401);
  });

  it("erasure is refused while a booking is ahead, then removes personal fields but keeps every money record", async () => {
    const v = await vendor(); const booking = await confirmed(v, "11:00");
    expect((await call("POST", "/v1/client/delete", { cookie: booking.customerCookie, body: { confirm: "DELETE" } })).body.error.code).toBe("ACTIVE_BOOKINGS");
    await call("POST", `/v1/vendor/bookings/${booking.id}/offline-payments`, { cookie: v.cookie, body: { kind: "balance", amount_paise: 10000, method: "upi", note: "UPI from Meena Iyer 9876" } });
    await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { cookie: v.cookie, body: { reason: "Studio closed" } });
    const before = (await pool.query("SELECT kind,amount_paise,payment_id,refund_id FROM ledger_entries WHERE booking_id=$1 ORDER BY created_at", [booking.id])).rows;
    expect((await call("POST", "/v1/client/delete", { cookie: booking.customerCookie, body: {} })).status).toBe(400);
    expect((await call("POST", "/v1/client/delete", { cookie: booking.customerCookie, body: { confirm: "DELETE" } })).status).toBe(204);
    const row = (await pool.query("SELECT client_name,client_email::text AS client_email,client_phone,customer_notes,client_erased_at,total_paise FROM bookings WHERE id=$1", [booking.id])).rows[0];
    expect(row).toMatchObject({ client_name: "Deleted customer", client_phone: "", customer_notes: null, total_paise: "100000" });
    expect(row.client_email).toBe(`deleted-${booking.customer.id}@deleted.invalid`); expect(row.client_erased_at).not.toBeNull();
    const ledger = (await pool.query("SELECT kind,amount_paise,payment_id,refund_id,reason FROM ledger_entries WHERE booking_id=$1 ORDER BY created_at", [booking.id])).rows;
    expect(ledger.map(({ reason: _reason, ...rest }) => rest)).toEqual(before);
    expect(ledger.every(entry => entry.reason === "[personal details removed]")).toBe(true);
    expect(JSON.stringify((await pool.query("SELECT note FROM payments WHERE booking_id=$1", [booking.id])).rows)).not.toContain("Meena");
    expect((await pool.query("SELECT count(*)::int AS n FROM payments WHERE booking_id=$1", [booking.id])).rows[0].n).toBe(2);
    expect((await call("GET", "/v1/client/export", { cookie: booking.customerCookie })).status).toBe(401);
    expect((await pool.query("SELECT email::text AS email,deleted_at FROM users WHERE id=$1", [booking.customer.id])).rows[0].email).toBe(`deleted-${booking.customer.id}@deleted.invalid`);
  });

  it("the ledger accepts only the erasure marker: amounts and deletes stay impossible", async () => {
    const booking = await confirmed(await vendor(), "12:00");
    const entry = (await pool.query<{ id: string }>("SELECT id FROM ledger_entries WHERE booking_id=$1 LIMIT 1", [booking.id])).rows[0].id;
    await expect(pool.query("UPDATE ledger_entries SET amount_paise=1 WHERE id=$1", [entry])).rejects.toThrow("append-only");
    await expect(pool.query("UPDATE ledger_entries SET reason='edited' WHERE id=$1", [entry])).rejects.toThrow("append-only");
    await expect(pool.query("UPDATE ledger_entries SET reason='[personal details removed]', amount_paise=amount_paise+1 WHERE id=$1", [entry])).rejects.toThrow("append-only");
    await expect(pool.query("DELETE FROM ledger_entries WHERE id=$1", [entry])).rejects.toThrow("append-only");
    await pool.query("UPDATE ledger_entries SET reason='[personal details removed]' WHERE id=$1", [entry]);
  });
});

// ---- IDOR: every route that takes an id, from another vendor or customer, answers 404 and changes nothing ---------------
type Route = { method: string; path: string };
function routesOf(prefix: string, router: Router): Route[] {
  return (router.stack as { route?: { path: string; methods: Record<string, boolean> } }[]).filter(layer => layer.route)
    .flatMap(layer => Object.keys(layer.route!.methods).filter(method => method !== "_all").map(method => ({ method: method.toUpperCase(), path: `${prefix}${layer.route!.path}` })));
}
const allRoutes = [...routesOf("/v1/vendor", vendorRouter), ...routesOf("/v1/vendor", dashboardRouter), ...routesOf("/v1/bookings", bookingRouter), ...routesOf("/v1/ical", icalRouter), ...routesOf("/v1/admin", adminRouter), ...routesOf("/v1/client", privacyRouter)];
const key = (route: Route) => `${route.method} ${route.path}`;

describe("IDOR suite (SPEC 12.4)", () => {
  it("vendor B (or another customer, or a non-admin) gets 404 on every id route of vendor A, and nothing changes", async () => {
    const a = await vendor(), b = await vendor();
    const booking = await confirmed(a, "13:00");
    const stranger = await createUser(pool, { role: "CLIENT" }); const strangerCookie = await sessionFor(stranger.id);
    const rule = (await pool.query<{ id: string }>("SELECT id FROM availability_rules WHERE vendor_id=$1 LIMIT 1", [a.id])).rows[0].id;
    const override = (await call("POST", "/v1/vendor/availability/overrides", { cookie: a.cookie, body: { local_date: day, kind: "block", start_time: "16:00", end_time: "17:00", note: "" } })).body.id;
    const blocked = (await call("POST", "/v1/vendor/availability/blocked-periods", { cookie: a.cookie, body: { starts_at: at("17:00"), ends_at: at("17:30"), reason: "" } })).body.id;
    const snapshot = async () => JSON.stringify((await pool.query(`SELECT
      (SELECT row_to_json(b) FROM (SELECT status,starts_at,client_name FROM bookings WHERE id=$1) b) AS booking,
      (SELECT count(*) FROM payments WHERE booking_id=$1) AS payments, (SELECT count(*) FROM booking_events WHERE booking_id=$1) AS events,
      (SELECT row_to_json(s) FROM (SELECT name,price_paise,active FROM services WHERE id=$2) s) AS service,
      (SELECT count(*) FROM availability_rules WHERE vendor_id=$3) AS rules, (SELECT count(*) FROM availability_overrides WHERE vendor_id=$3) AS overrides, (SELECT count(*) FROM blocked_periods WHERE vendor_id=$3) AS blocked`, [booking.id, a.serviceId, a.id])).rows[0]);
    const before = await snapshot();
    const asB = { cookie: b.cookie }, asStranger = { cookie: strangerCookie };
    const cases: Record<string, () => Promise<Reply[]>> = {
      "PATCH /v1/vendor/services/:id": async () => [await call("PATCH", `/v1/vendor/services/${a.serviceId}`, { ...asB, body: { name: "Hijacked" } })],
      "DELETE /v1/vendor/services/:id": async () => [await call("DELETE", `/v1/vendor/services/${a.serviceId}`, asB)],
      "DELETE /v1/vendor/availability/rules/:id": async () => [await call("DELETE", `/v1/vendor/availability/rules/${rule}`, asB)],
      "DELETE /v1/vendor/availability/overrides/:id": async () => [await call("DELETE", `/v1/vendor/availability/overrides/${override}`, asB)],
      "DELETE /v1/vendor/availability/blocked-periods/:id": async () => [await call("DELETE", `/v1/vendor/availability/blocked-periods/${blocked}`, asB)],
      "POST /v1/vendor/bookings/:id/offline-payments": async () => [await call("POST", `/v1/vendor/bookings/${booking.id}/offline-payments`, { ...asB, body: { kind: "balance", amount_paise: 100, method: "cash", note: "not mine" } })],
      "GET /v1/vendor/bookings/:id": async () => [await call("GET", `/v1/vendor/bookings/${booking.id}`, asB)],
      "POST /v1/vendor/bookings/:id/cancel": async () => [await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { ...asB, body: { reason: "not mine" } })],
      "POST /v1/vendor/bookings/:id/complete": async () => [await call("POST", `/v1/vendor/bookings/${booking.id}/complete`, { ...asB, body: {} })],
      "POST /v1/vendor/bookings/:id/reschedule": async () => [await call("POST", `/v1/vendor/bookings/${booking.id}/reschedule`, { ...asB, body: { date: day, time: "15:00" } })],
      "GET /v1/bookings/:id": async () => [await call("GET", `/v1/bookings/${booking.id}`, asB), await call("GET", `/v1/bookings/${booking.id}`, asStranger), await call("GET", `/v1/bookings/${booking.id}`, { token: "x".repeat(43) })],
      "POST /v1/bookings/:id/accept": async () => [await call("POST", `/v1/bookings/${booking.id}/accept`, { ...asStranger, body: { terms_hash: "0".repeat(64), accepted: true } })],
      "POST /v1/bookings/:id/cancel": async () => [await call("POST", `/v1/bookings/${booking.id}/cancel`, { ...asStranger, body: {} }), await call("POST", `/v1/bookings/${booking.id}/cancel`, { ...asB, body: {} })],
      "POST /v1/bookings/:id/payment-order": async () => [await call("POST", `/v1/bookings/${booking.id}/payment-order`, { ...asStranger, body: {} })],
      "POST /v1/bookings/:id/payment-verify": async () => [await call("POST", `/v1/bookings/${booking.id}/payment-verify`, { ...asStranger, body: { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" } })],
      "GET /v1/bookings/:id/receipts/:paymentId": async () => [await call("GET", `/v1/bookings/${booking.id}/receipts/${booking.paymentId}`, asB), await call("GET", `/v1/bookings/${booking.id}/receipts/${booking.paymentId}`, asStranger)],
      "GET /v1/ical/:file": async () => [await call("GET", `/v1/ical/${"A".repeat(43)}.ics`)],
      // The admin console: a vendor is not an admin, so every admin route is the same 404.
      ...Object.fromEntries(allRoutes.filter(route => route.path.startsWith("/v1/admin/") && route.path.includes(":")).map(route => [key(route), async () => [await call(route.method, route.path.replace(":id", booking.id).replace(":kind", "tick"), { ...asB, body: route.method === "GET" ? undefined : {} })]]))
    };
    // Coverage: a new route with an id must get a case here before it can ship.
    const withId = allRoutes.filter(route => route.path.includes(":")).map(key);
    expect(allRoutes.length, "routes found in the routers").toBeGreaterThan(50);
    expect(withId.length, "id routes found").toBeGreaterThanOrEqual(25);
    expect(withId.filter(name => !(name in cases)), "id routes without an IDOR case").toEqual([]);
    for (const [name, run] of Object.entries(cases)) for (const reply of await run()) expect(reply.status, `${name}: ${reply.text.slice(0, 120)}`).toBe(404);
    expect(await snapshot()).toBe(before);
  });

  it("no list or overview of vendor B ever contains vendor A's records", async () => {
    const a = await vendor(), b = await vendor(); const booking = await confirmed(a, "14:00");
    const secrets = [a.id, a.serviceId, a.slug, booking.id, booking.customer.email];
    const lists = allRoutes.filter(route => route.method === "GET" && route.path.startsWith("/v1/vendor") && !route.path.includes(":"));
    expect(lists.length).toBeGreaterThan(8);
    for (const route of lists) {
      const reply = await call("GET", route.path.replace("/calendar", `/calendar?from=${day}&to=${day}`), { cookie: b.cookie });
      expect(reply.status, route.path).toBe(200);
      for (const value of secrets) expect(reply.text.includes(value), `${route.path} leaks ${value}`).toBe(false);
    }
  });
});

// ---- Log scan (SPEC 18.1, 16.7 item 12) -----------------------------------------------------------------------------
const luhn = (digits: string) => { let sum = 0; for (let index = 0; index < digits.length; index++) { let digit = Number(digits[digits.length - 1 - index]); if (index % 2) { digit *= 2; if (digit > 9) digit -= 9; } sum += digit; } return sum % 10 === 0; };
describe("log scan", () => {
  it("nothing logged during sign-up, sign-in, booking, payment, refund and failures contains a code, token, secret or card number", async () => {
    const lines: string[] = [];
    setLogger(createLogger(new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }), "info"));
    const watched: string[] = [config.SESSION_SECRET, config.OTP_PEPPER, config.TICK_SECRET ?? "", "fake_key_secret_for_tests", "fake_webhook_secret_for_tests"].filter(value => value.length >= 8);
    try {
      const email = `logscan-${randomUUID().slice(0, 8)}@example.test`, since = capturedEmails().length;
      await call("POST", "/v1/auth/otp/request", { body: { email, purpose: "signup" } });
      let code = "";
      for (let tries = 0; tries < 500 && !code; tries++) { code = /\b(\d{6})\b/.exec(capturedEmails().slice(since).find(item => item.to === email)?.text ?? "")?.[1] ?? ""; if (!code) await new Promise(resolve => setTimeout(resolve, 20)); }
      watched.push(code);
      const signup = await call("POST", "/v1/auth/signup", { body: { email, code, password: "lantern-harbour-violet-7" } });
      watched.push("lantern-harbour-violet-7", /bayana_session=([^;]+)/.exec(signup.headers.get("set-cookie") ?? "")![1]);
      await call("POST", "/v1/auth/login", { body: { email, password: "wrong-password-123" } });
      await call("POST", "/v1/auth/login", { body: { email, code: "000000" } });
      const v = await vendor();
      const booking = await confirmed(v, "15:00", "Card 4111 1111 1111 1111, call me");
      watched.push(booking.token, v.cookie.split("=")[1], booking.customerCookie.split("=")[1]);
      await call("POST", "/webhooks/razorpay", { headers: { "x-razorpay-signature": "bad-signature-value", "x-razorpay-event-id": `evt_${randomUUID()}` }, body: { event: "payment.captured" } });
      await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { cookie: v.cookie, body: { reason: "Testing the log scan" } });
      await call("POST", "/internal/jobs/tick", { headers: { authorization: "Bearer not-the-secret" } });
      await new Promise(resolve => setTimeout(resolve, 200));
    } finally { setLogger(createLogger()); }
    const text = lines.join("");
    expect(lines.length, "the flows above should log something").toBeGreaterThan(0);
    for (const value of watched) expect(text.includes(value), `log contains a watched value of length ${value.length}`).toBe(false);
    const cardLike = [...text.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g)].map(match => match[0].replace(/\D/g, "")).filter(digits => digits.length >= 13 && digits.length <= 19 && luhn(digits));
    expect(cardLike, "card-like numbers in logs").toEqual([]);
    expect(text).not.toMatch(/\b(rzp_(test|live)_[A-Za-z0-9]{6,}|GOCSPX-|Bearer [A-Za-z0-9])/);
  });
});
