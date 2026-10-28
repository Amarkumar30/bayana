import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { pool, transaction } from "../../src/database.js";
import { FakeProvider } from "../../src/payments/fake-provider.js";
import { useTestPayments } from "../../src/payments/runtime.js";
import { base32Decode, hotp, totpStep } from "../../src/totp.js";
import { createUser } from "../helpers.js";

// Phase 9: vendor dashboard (SPEC 5.3, BK-09, BK-11..13) and admin console (AD-01..04, AU-10), through the real HTTP routes.
let server: ReturnType<typeof app.listen>; let base = ""; let fake: FakeProvider;
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
beforeEach(() => { fake = new FakeProvider(); useTestPayments({ mode: "test", provider: fake }); });
afterAll(async () => { useTestPayments(null); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; body: Record<string, any>; text: string; headers: Headers };
async function call(method: string, path: string, options: { cookie?: string; token?: string; body?: unknown; key?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.66.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-booking-token": options.token } : {}), ...(options.key ? { "idempotency-key": options.key } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, text, headers: response.headers };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;
const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const at = (time: string) => { const [h, m] = time.split(":").map(Number); return new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m) - 330 * 60_000).toISOString(); };

async function vendor() {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `dash-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Studio Dash','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value,cancellation_tiers) VALUES($1,$2,'Session',100000,60,'hourly','PERCENT',20,$3)", [serviceId, id, JSON.stringify([{ min_hours_before: 48, refund_percent: 50 }])]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerId: owner.id, ownerEmail: owner.email, cookie: await sessionFor(owner.id) };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
/** A customer hold at a local time, terms accepted: PENDING and waiting for the Rs 200 advance. */
async function pending(v: Vendor, time = "09:00") {
  const customer = await createUser(pool, { role: "CLIENT" }); const cookie = await sessionFor(customer.id);
  const held = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: at(time), name: "Asha Rao" } });
  expect(held.status).toBe(201);
  const id = held.body.booking.id as string, token = held.body.booking.access_token as string;
  const view = await call("GET", `/v1/bookings/${id}`, { token });
  expect((await call("POST", `/v1/bookings/${id}/accept`, { token, body: { terms_hash: view.body.contract_preview.sha256, accepted: true } })).status).toBe(200);
  return { id, token, customerEmail: customer.email };
}
/** Pending, then paid online in full advance through Checkout: CONFIRMED with a Rs 200 verified Razorpay payment. */
async function confirmed(v: Vendor, time = "09:00") {
  const booking = await pending(v, time);
  const order = await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: {} });
  const paid = fake.pay(order.body.order_id);
  const verified = await call("POST", `/v1/bookings/${booking.id}/payment-verify`, { token: booking.token, body: { razorpay_order_id: paid.razorpay_order_id, razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: paid.razorpay_signature } });
  expect(verified.body.booking.status).toBe("CONFIRMED");
  return booking;
}
const row = async (id: string) => (await pool.query("SELECT status,starts_at,ends_at,block_start,block_end FROM bookings WHERE id=$1", [id])).rows[0];
const mail = async (bookingId: string, template: string) => (await pool.query<{ recipient: string }>("SELECT recipient::text AS recipient FROM email_outbox WHERE booking_id=$1 AND template=$2", [bookingId, template])).rows.map(r => r.recipient);

describe("vendor ownership (SPEC 3.1)", () => {
  it("another vendor gets the same 404 for every booking route, and never sees the booking in lists", async () => {
    const a = await vendor(), b = await vendor(); const booking = await pending(a);
    for (const [method, path, body] of [["GET", `/v1/vendor/bookings/${booking.id}`], ["POST", `/v1/vendor/bookings/${booking.id}/cancel`, { reason: "not mine" }], ["POST", `/v1/vendor/bookings/${booking.id}/complete`, {}], ["POST", `/v1/vendor/bookings/${booking.id}/reschedule`, { date: day, time: "15:00" }], ["POST", `/v1/vendor/bookings/${booking.id}/offline-payments`, { kind: "advance", amount_paise: 20000, method: "cash", note: "not mine" }]] as const) {
      const reply = await call(method, path, { cookie: b.cookie, body });
      expect(reply.status, path).toBe(404);
    }
    expect((await row(booking.id)).status).toBe("PENDING");
    expect((await call("GET", "/v1/vendor/bookings", { cookie: b.cookie })).body.bookings).toEqual([]);
    expect((await call("GET", `/v1/vendor/calendar?from=${day}&to=${day}`, { cookie: b.cookie })).body.bookings).toEqual([]);
    expect((await call("GET", "/v1/vendor/customers", { cookie: b.cookie })).body.customers).toEqual([]);
    expect((await call("GET", `/v1/vendor/bookings/${booking.id}`, { cookie: a.cookie })).status).toBe(200);
    expect((await call("GET", "/v1/vendor/overview")).status).toBe(401);
  });
});

describe("vendor booking actions", () => {
  it("BK-11: vendor cancel needs a reason, refunds everything paid, records actor and reason, emails the customer", async () => {
    const v = await vendor(); const booking = await confirmed(v);
    expect((await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { cookie: v.cookie, body: { reason: "" } })).status).toBe(400);
    const reply = await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { cookie: v.cookie, body: { reason: "Studio flooded" } });
    expect(reply.status).toBe(200);
    expect(reply.body.status).toBe("CANCELLED");
    // The customer would only get 50% under the tiers; a vendor cancellation refunds the full advance.
    expect(reply.body.refunds).toEqual([expect.objectContaining({ amount_paise: 20000, status: "processed" })]);
    expect(fake.calls).toContain("createRefund");
    const event = (await pool.query("SELECT actor,reason,meta FROM booking_events WHERE booking_id=$1 AND to_status='CANCELLED'", [booking.id])).rows[0];
    expect(event).toMatchObject({ actor: "vendor", reason: "Studio flooded", meta: expect.objectContaining({ refund_paise: 20000, refund_percent: 100 }) });
    expect(await mail(booking.id, "booking_cancelled")).toContain(booking.customerEmail);
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE action='booking.vendor_cancelled' AND resource_id=$1 AND actor_user_id=$2", [booking.id, v.ownerId])).rowCount).toBe(1);
  });

  it("BK-12: only a confirmed booking in the past can be completed", async () => {
    const v = await vendor(); const booking = await confirmed(v);
    const early = await call("POST", `/v1/vendor/bookings/${booking.id}/complete`, { cookie: v.cookie, body: {} });
    expect(early.status).toBe(409);
    // Move the finished booking into the past directly (the API never allows a past time).
    await pool.query("UPDATE bookings SET starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours',block_start=now()-interval '3 hours',block_end=now()-interval '2 hours' WHERE id=$1", [booking.id]);
    const done = await call("POST", `/v1/vendor/bookings/${booking.id}/complete`, { cookie: v.cookie, body: {} });
    expect(done.body.status).toBe("COMPLETED");
    const pendingOne = await pending(v, "11:00");
    expect((await call("POST", `/v1/vendor/bookings/${pendingOne.id}/complete`, { cookie: v.cookie, body: {} })).status).toBe(409);
  });

  it("BK-09: rescheduling onto a taken slot fails atomically; a free slot moves it with an event and an email", async () => {
    const v = await vendor(); const moving = await confirmed(v, "09:00"); await confirmed(v, "12:00");
    const before = await row(moving.id);
    const clash = await call("POST", `/v1/vendor/bookings/${moving.id}/reschedule`, { cookie: v.cookie, body: { date: day, time: "12:30" } });
    expect(clash.status).toBe(409); expect(clash.body.error.code).toBe("SLOT_TAKEN");
    expect(await row(moving.id)).toEqual(before);
    expect((await pool.query("SELECT 1 FROM booking_events WHERE booking_id=$1 AND reason='rescheduled'", [moving.id])).rowCount).toBe(0);
    await call("POST", "/v1/vendor/availability/blocked-periods", { cookie: v.cookie, body: { starts_at: at("16:00"), ends_at: at("17:00"), reason: "Dentist" } });
    expect((await call("POST", `/v1/vendor/bookings/${moving.id}/reschedule`, { cookie: v.cookie, body: { date: day, time: "16:00" } })).body.error.code).toBe("BOOKING_CONFLICT");
    const moved = await call("POST", `/v1/vendor/bookings/${moving.id}/reschedule`, { cookie: v.cookie, body: { date: day, time: "14:00" } });
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.starts_at).toISOString()).toBe(at("14:00"));
    expect(new Date(moved.body.ends_at).toISOString()).toBe(at("15:00"));
    expect(moved.body.status).toBe("CONFIRMED");
    expect(moved.body.payments).toHaveLength(1);
    const change = (await pool.query("SELECT from_status,to_status,actor,meta FROM booking_events WHERE booking_id=$1 AND reason='rescheduled'", [moving.id])).rows[0];
    expect(change).toMatchObject({ from_status: "CONFIRMED", to_status: "CONFIRMED", actor: "vendor", meta: expect.objectContaining({ to_starts_at: at("14:00") }) });
    expect(await mail(moving.id, "booking_rescheduled")).toEqual([moving.customerEmail]);
    // The old time is free again for customers.
    const slots = await call("GET", `/v1/vendors/${v.slug}/availability/slots?date=${day}&service_id=${v.serviceId}`);
    expect(slots.body.slots.map((slot: { startsAt: string }) => slot.startsAt)).toContain(at("09:00"));
  });

  it("BK-13: a manual booking blocks the slot for customers at once and replays idempotently", async () => {
    const v = await vendor(); const key = randomUUID();
    const body = { service_id: v.serviceId, date: day, time: "10:00", name: "Walk-in Ravi", email: "ravi@example.test", phone: "9800000000", notes: "Phone booking" };
    const created = await call("POST", "/v1/vendor/bookings", { cookie: v.cookie, key, body });
    expect(created.status).toBe(201); expect(created.body.status).toBe("CONFIRMED");
    expect(created.body.advance_paise).toBe(0); expect(created.body.total_paise).toBe(100000);
    const again = await call("POST", "/v1/vendor/bookings", { cookie: v.cookie, key, body });
    expect(again.status).toBe(200); expect(again.body.id).toBe(created.body.id);
    expect((await call("POST", "/v1/vendor/bookings", { cookie: v.cookie, key, body: { ...body, name: "Someone else" } })).status).toBe(422);
    const customer = await createUser(pool, { role: "CLIENT" });
    const hold = await call("POST", "/v1/bookings", { cookie: await sessionFor(customer.id), key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: at("10:00"), name: "Late customer" } });
    expect(hold.status).toBe(409); expect(hold.body.error.code).toBe("SLOT_TAKEN");
    const overlap = await call("POST", "/v1/vendor/bookings", { cookie: v.cookie, key: randomUUID(), body: { ...body, time: "10:30" } });
    expect(overlap.body.error.code).toBe("SLOT_TAKEN");
    const events = (await pool.query("SELECT from_status,to_status,actor FROM booking_events WHERE booking_id=$1 ORDER BY created_at", [created.body.id])).rows;
    expect(events).toEqual([{ from_status: null, to_status: "PENDING", actor: "vendor" }, { from_status: "PENDING", to_status: "CONFIRMED", actor: "vendor" }]);
    // The customer email carries a private link (no account needed).
    expect((await pool.query("SELECT text_body FROM email_outbox WHERE booking_id=$1 AND template='booking_confirmed_customer'", [created.body.id])).rows[0].text_body).toMatch(/\/b\/[0-9a-f-]+\?t=/);
    expect((await call("POST", "/v1/vendor/bookings", { cookie: v.cookie, key: randomUUID(), body: { ...body, date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) } })).body.error.code).toBe("TIME_IN_PAST");
  });
});

describe("vendor read pages", () => {
  it("overview, list filters, calendar, payments and customers reflect real bookings", async () => {
    useTestPayments({ mode: "disabled", provider: null });
    const v = await vendor(); const waiting = await pending(v, "09:00");
    useTestPayments({ mode: "test", provider: fake });
    await confirmed(v, "13:00");
    const overview = (await call("GET", "/v1/vendor/overview", { cookie: v.cookie })).body;
    expect(overview.todo).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "record_advance", id: waiting.id, amount_paise: 20000 })]));
    expect(overview.money.collected_30d_paise).toBe(20000);
    expect(overview.money.balance_due_paise).toBe(100000 + 80000);
    const list = await call("GET", "/v1/vendor/bookings?status=PENDING", { cookie: v.cookie });
    expect(list.body.bookings.map((b: { id: string }) => b.id)).toEqual([waiting.id]);
    expect((await call("GET", `/v1/vendor/bookings?q=${encodeURIComponent(waiting.customerEmail)}`, { cookie: v.cookie })).body.bookings).toHaveLength(1);
    expect((await call("GET", `/v1/vendor/bookings?from=${day}&to=${day}`, { cookie: v.cookie })).body.bookings).toHaveLength(2);
    expect((await call("GET", "/v1/vendor/bookings?status=NOPE", { cookie: v.cookie })).status).toBe(400);
    const calendar = (await call("GET", `/v1/vendor/calendar?from=${day}&to=${day}`, { cookie: v.cookie })).body;
    expect(calendar.bookings.map((b: { status: string }) => b.status).sort()).toEqual(["CONFIRMED", "PENDING"]);
    const payments = (await call("GET", "/v1/vendor/payments", { cookie: v.cookie })).body;
    expect(payments.summary).toMatchObject({ received_paise: 20000, online_paise: 20000, offline_paise: 0 });
    expect(payments.balances_due).toHaveLength(1);
    const customers = (await call("GET", "/v1/vendor/customers", { cookie: v.cookie })).body.customers;
    expect(customers).toHaveLength(2);
    const detail = (await call("GET", `/v1/vendor/bookings/${waiting.id}`, { cookie: v.cookie })).body;
    expect(detail.customer.email).toBe(waiting.customerEmail);
    expect(detail.actions).toMatchObject({ cancel: true, complete: false, reschedule: true, record_payment: true });
    expect(detail.events.map((e: { to_status: string }) => e.to_status)).toEqual(["HELD", "PENDING"]);
  });

  it("notification preferences stop the vendor's copy only", async () => {
    const v = await vendor();
    expect((await call("PUT", "/v1/vendor/settings/notifications", { cookie: v.cookie, body: { booking_confirmed: false, booking_cancelled: true, reminder_24h: true } })).status).toBe(200);
    expect((await call("GET", "/v1/vendor/settings", { cookie: v.cookie })).body.notify_prefs.booking_confirmed).toBe(false);
    const booking = await confirmed(v);
    expect(await mail(booking.id, "booking_confirmed_vendor")).toEqual([]);
    expect(await mail(booking.id, "booking_confirmed_customer")).toEqual([booking.customerEmail]);
  });

  it("iCal feed: secret URL shown once, contains the bookings, rotating kills the old URL", async () => {
    const v = await vendor(); const booking = await confirmed(v);
    const first = (await call("POST", "/v1/vendor/settings/ical", { cookie: v.cookie, body: {} })).body.path as string;
    const feed = await call("GET", first);
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toContain("text/calendar");
    expect(feed.text).toContain(`UID:${booking.id}@bayana`);
    expect(feed.text).toContain("BEGIN:VCALENDAR\r\n");
    expect(feed.text).not.toContain(booking.customerEmail);
    const second = (await call("POST", "/v1/vendor/settings/ical", { cookie: v.cookie, body: {} })).body.path as string;
    expect((await call("GET", first)).status).toBe(404);
    expect((await call("GET", second)).status).toBe(200);
    expect((await call("GET", "/v1/ical/not-a-token.ics")).status).toBe(404);
    const stored = (await pool.query<{ ical_token_hash: string }>("SELECT ical_token_hash FROM vendors WHERE id=$1", [v.id])).rows[0].ical_token_hash;
    expect(second).not.toContain(stored);
  });

  it("export returns the vendor's data; delete is refused with upcoming bookings and otherwise closes the account", async () => {
    const v = await vendor(); const booking = await confirmed(v);
    const exported = await call("GET", "/v1/vendor/export", { cookie: v.cookie });
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    expect(exported.body.bookings.map((b: { id: string }) => b.id)).toEqual([booking.id]);
    expect(exported.body.payments).toHaveLength(1);
    expect((await call("POST", "/v1/vendor/account/delete", { cookie: v.cookie, body: { confirm_slug: "wrong" } })).body.error.code).toBe("CONFIRMATION_MISMATCH");
    expect((await call("POST", "/v1/vendor/account/delete", { cookie: v.cookie, body: { confirm_slug: v.slug } })).body.error.code).toBe("ACTIVE_BOOKINGS");
    await call("POST", `/v1/vendor/bookings/${booking.id}/cancel`, { cookie: v.cookie, body: { reason: "Closing the business" } });
    expect((await call("POST", "/v1/vendor/account/delete", { cookie: v.cookie, body: { confirm_slug: v.slug } })).status).toBe(204);
    expect((await call("GET", "/v1/vendor/overview", { cookie: v.cookie })).status).toBe(401);
    const user = (await pool.query("SELECT email::text AS email,password_hash,deleted_at FROM users WHERE id=$1", [v.ownerId])).rows[0];
    expect(user.email).toBe(`deleted-${v.ownerId}@deleted.invalid`); expect(user.password_hash).toBeNull(); expect(user.deleted_at).not.toBeNull();
    expect((await pool.query("SELECT published FROM vendors WHERE id=$1", [v.id])).rows[0].published).toBe(false);
    // Financial records stay (PV-02).
    expect((await pool.query("SELECT count(*)::int AS n FROM payments WHERE booking_id=$1", [booking.id])).rows[0].n).toBe(1);
  });
});

// ---- Admin ----------------------------------------------------------------------------------------------------------
async function admin() {
  const user = await createUser(pool);
  await pool.query("UPDATE users SET is_admin=true WHERE id=$1", [user.id]);
  return { ...user, cookie: await sessionFor(user.id) };
}
/** Enrols (first time) and passes the second factor on this session. */
async function verifiedAdmin() {
  const a = await admin();
  const enrol = await call("POST", "/v1/admin/2fa/enroll", { cookie: a.cookie, body: {} });
  expect(enrol.status).toBe(200);
  const secret = base32Decode(enrol.body.secret);
  const verify = await call("POST", "/v1/admin/2fa/verify", { cookie: a.cookie, body: { code: hotp(secret, totpStep()) } });
  expect(verify.status).toBe(200);
  return { ...a, secret };
}

describe("admin access (AU-10)", () => {
  it("anonymous 401, non-admin 404, admin without the second factor 403, admin with it 200", async () => {
    expect((await call("GET", "/v1/admin/health")).status).toBe(401);
    const vendorUser = await vendor();
    expect((await call("GET", "/v1/admin/health", { cookie: vendorUser.cookie })).status).toBe(404);
    expect((await call("POST", "/v1/admin/2fa/enroll", { cookie: vendorUser.cookie, body: {} })).status).toBe(404);
    const a = await admin();
    const blocked = await call("GET", "/v1/admin/bookings", { cookie: a.cookie });
    expect(blocked.status).toBe(403); expect(blocked.body.error).toMatchObject({ code: "SECOND_FACTOR_REQUIRED", details: { enrolled: false } });
    const enrol = await call("POST", "/v1/admin/2fa/enroll", { cookie: a.cookie, body: {} });
    expect(enrol.body.otpauth_url).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+&issuer=Bayana/);
    expect((await pool.query("SELECT totp_secret_enc FROM users WHERE id=$1", [a.id])).rows[0].totp_secret_enc).not.toContain(enrol.body.secret);
    const secret = base32Decode(enrol.body.secret);
    expect((await call("POST", "/v1/admin/2fa/verify", { cookie: a.cookie, body: { code: hotp(secret, totpStep() + 5) } })).status).toBe(400);
    const code = hotp(secret, totpStep());
    expect((await call("POST", "/v1/admin/2fa/verify", { cookie: a.cookie, body: { code } })).status).toBe(200);
    expect((await call("GET", "/v1/admin/bookings", { cookie: a.cookie })).status).toBe(200);
    // The same code cannot be replayed, and a second session of the same admin needs its own check.
    const other = await sessionFor(a.id);
    expect((await call("POST", "/v1/admin/2fa/verify", { cookie: other, body: { code } })).status).toBe(400);
    expect((await call("GET", "/v1/admin/bookings", { cookie: other })).status).toBe(403);
    expect((await call("POST", "/v1/admin/2fa/enroll", { cookie: a.cookie, body: {} })).status).toBe(409);
  });

  it("wrong codes are limited to 5 per 15 minutes", async () => {
    const a = await admin(); await call("POST", "/v1/admin/2fa/enroll", { cookie: a.cookie, body: {} });
    for (let attempt = 0; attempt < 5; attempt++) expect((await call("POST", "/v1/admin/2fa/verify", { cookie: a.cookie, body: { code: "000000" } })).status).toBeOneOf([400, 200]);
    expect((await call("POST", "/v1/admin/2fa/verify", { cookie: a.cookie, body: { code: "000000" } })).status).toBe(429);
  });
});

describe("admin console (AD-01..04)", () => {
  it("every read writes an audit row; search finds a booking by email and by id", async () => {
    const a = await verifiedAdmin(); const v = await vendor(); const booking = await pending(v);
    const byEmail = await call("GET", `/v1/admin/bookings?q=${encodeURIComponent(booking.customerEmail)}`, { cookie: a.cookie });
    expect(byEmail.body.bookings.map((b: { id: string }) => b.id)).toEqual([booking.id]);
    expect((await call("GET", `/v1/admin/bookings?q=${booking.id.slice(0, 8)}`, { cookie: a.cookie })).body.bookings.map((b: { id: string }) => b.id)).toContain(booking.id);
    const detail = await call("GET", `/v1/admin/bookings/${booking.id}`, { cookie: a.cookie });
    expect(detail.body.booking).not.toHaveProperty("access_token_hash");
    const views = (await pool.query("SELECT resource_type,resource_id FROM audit_logs WHERE actor_user_id=$1 AND action='admin.view' ORDER BY created_at", [a.id])).rows;
    expect(views).toEqual([{ resource_type: "bookings", resource_id: "list" }, { resource_type: "bookings", resource_id: "list" }, { resource_type: "booking", resource_id: booking.id }]);
    for (const path of ["/v1/admin/users", `/v1/admin/users/${v.ownerId}`, "/v1/admin/vendors", `/v1/admin/vendors/${v.id}`, "/v1/admin/payments", "/v1/admin/webhooks?status=review", "/v1/admin/outbox?status=failed", "/v1/admin/job-runs", "/v1/admin/audit", "/v1/admin/health"]) {
      const before = (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id=$1", [a.id])).rows[0].n;
      expect((await call("GET", path, { cookie: a.cookie })).status, path).toBe(200);
      expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id=$1", [a.id])).rows[0].n, path).toBe(before + 1);
    }
  });

  it("gate: a stuck booking (paid at Razorpay, never verified) is explained and fixed from the admin API without SQL", async () => {
    const a = await verifiedAdmin(); const v = await vendor(); const booking = await pending(v);
    const order = await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: {} });
    fake.pay(order.body.order_id); // the customer paid, but the browser closed before verify and no webhook arrived
    const before = (await call("GET", `/v1/admin/bookings/${booking.id}`, { cookie: a.cookie })).body;
    expect(before.booking.status).toBe("PENDING");
    const finding = before.diagnosis.find((item: { action?: { kind: string } }) => item.action?.kind === "reverify_payment");
    expect(finding.text).toContain(order.body.order_id);
    const fixed = await call("POST", `/v1/admin/payments/${finding.action.id}/reverify`, { cookie: a.cookie, body: {} });
    expect(fixed.body.outcome).toBe("confirmed");
    const after = (await call("GET", `/v1/admin/bookings/${booking.id}`, { cookie: a.cookie })).body;
    expect(after.booking.status).toBe("CONFIRMED");
    expect(after.diagnosis).toEqual([expect.objectContaining({ level: "ok" })]);
    expect(after.events.at(-1)).toMatchObject({ to_status: "CONFIRMED", actor: "razorpay" });
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE action='admin.payment_reverified' AND resource_id=$1 AND actor_user_id=$2", [booking.id, a.id])).rowCount).toBe(1);
  });

  it("retries a failed email, reprocesses a webhook marked for review, runs the tick, and the health page shows tick age", async () => {
    const a = await verifiedAdmin(); const v = await vendor(); const booking = await pending(v);
    const email = (await pool.query<{ id: string }>("SELECT id FROM email_outbox WHERE booking_id=$1 LIMIT 1", [booking.id])).rows[0].id;
    await pool.query("UPDATE email_outbox SET status='failed',attempts=5,failed_at=now(),last_error='SMTP down' WHERE id=$1", [email]);
    const diagnosis = (await call("GET", `/v1/admin/bookings/${booking.id}`, { cookie: a.cookie })).body.diagnosis;
    expect(diagnosis).toEqual(expect.arrayContaining([expect.objectContaining({ action: expect.objectContaining({ kind: "retry_email", id: email }) })]));
    expect((await call("POST", `/v1/admin/outbox/${email}/retry`, { cookie: a.cookie, body: {} })).status).toBe(200);
    expect((await pool.query("SELECT status FROM email_outbox WHERE id=$1", [email])).rows[0].status).toBe("sent");
    expect((await call("POST", `/v1/admin/outbox/${email}/retry`, { cookie: a.cookie, body: {} })).status).toBe(409);
    const eventId = `evt_admin_${randomUUID()}`;
    await pool.query("INSERT INTO webhook_events(event_id,payload,type,needs_review,error) VALUES($1,$2,'payment.failed',true,'Processing failed')", [eventId, JSON.stringify({ event: "payment.failed", payload: {} })]);
    const reprocessed = await call("POST", `/v1/admin/webhooks/${eventId}/reprocess`, { cookie: a.cookie, body: {} });
    expect(reprocessed.status).toBe(200); expect(reprocessed.body.processed_at).not.toBeNull();
    expect((await call("POST", `/v1/admin/webhooks/${eventId}/reprocess`, { cookie: a.cookie, body: {} })).status).toBe(409);
    expect((await call("POST", "/v1/admin/jobs/tick", { cookie: a.cookie, body: {} })).body.ok).toBe(true);
    const health = (await call("GET", "/v1/admin/health", { cookie: a.cookie })).body;
    expect(health).toMatchObject({ database: "ok", tick_stale: false }); expect(health.tick_age_minutes).toBeLessThanOrEqual(1);
    const actions = (await pool.query("SELECT action FROM audit_logs WHERE actor_user_id=$1 AND action <> 'admin.view' ORDER BY created_at", [a.id])).rows.map(r => r.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.email_retried", "admin.webhook_reprocessed", "admin.job_run"]));
  });
});
