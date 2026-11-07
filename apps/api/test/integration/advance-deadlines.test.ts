import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { settleDeadlines } from "../../src/advance-deadlines.js";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { transitionBooking } from "../../src/booking-transition.js";
import { pool, transaction } from "../../src/database.js";
import { runTick } from "../../src/jobs.js";
import { createUser } from "../helpers.js";

// An offline advance's deadline: stated in IST, reminded once, expired lazily with one email each way, refused when late, and
// extended by the vendor. Nothing here needs the tick, except the test that it still works as the backstop. A tick in another
// test file may hold a row for a moment (SKIP LOCKED), so expiry is awaited rather than read once.
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

// Ten days ahead, 09:00 in India: never a date written into the test.
const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), start = `${day}T03:30:00.000Z`;
const HOUR = 3_600_000;
type Reply = { status: number; body: Record<string, any> };
async function call(method: string, path: string, options: { cookie?: string; body?: unknown; key?: string; token?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "user-agent": "deadline-test/1.0", "x-forwarded-for": `10.89.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.key ? { "idempotency-key": options.key } : {}), ...(options.token ? { "x-booking-token": options.token } : {}) }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;

async function vendor() {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `dead-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,cancellation_policy,rescheduling_policy,phone_required) VALUES($1,$2,$3,'Studio','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Terms.','Cancel.','Move.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value,cancellation_tiers) VALUES($1,$2,'Session',100000,60,'hourly','PERCENT',20,'[]')", [serviceId, id]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerEmail: owner.email, cookie: await sessionFor(owner.id), ownerId: owner.id };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
async function held(v: Vendor, at = start) {
  const customer = await createUser(pool, { role: "CLIENT" }); const cookie = await sessionFor(customer.id);
  const created = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: at.slice(0, 10), service_id: v.serviceId, starts_at: at, name: "Asha Rao" } });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return { id: created.body.booking.id as string, token: created.body.booking.access_token as string, cookie, email: customer.email };
}
/** A customer who held and agreed: the booking waits for an offline advance. */
async function waiting(v: Vendor, at = start) {
  const h = await held(v, at);
  const view = await call("GET", `/v1/bookings/${h.id}`, { token: h.token });
  const accepted = await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: view.body.contract_preview.sha256, accepted: true } });
  expect(accepted.body.booking.status).toBe("PENDING");
  return h;
}
const setDeadline = (id: string, fromNowMs: number) => pool.query("UPDATE bookings SET hold_expires_at=$2 WHERE id=$1", [id, new Date(Date.now() + fromNowMs)]);
const emails = async (id: string, template: string) => (await pool.query<{ recipient: string; subject: string; text_body: string }>("SELECT recipient::text,subject,text_body FROM email_outbox WHERE booking_id=$1 AND template=$2 ORDER BY recipient", [id, template])).rows;
const status = async (id: string) => (await pool.query<{ status: string }>("SELECT status FROM bookings WHERE id=$1", [id])).rows[0].status;
const offered = async (v: Vendor) => ((await call("GET", `/v1/vendors/${v.slug}/availability/slots?service_id=${v.serviceId}&date=${day}`)).body.slots as { startsAt: string }[]).some(slot => new Date(slot.startsAt).getTime() === new Date(start).getTime());
const record = (v: Vendor, id: string, extra: Record<string, unknown> = {}) => call("POST", `/v1/vendor/bookings/${id}/offline-payments`, { cookie: v.cookie, body: { kind: "advance", amount_paise: 20000, method: "upi", ...extra } });

describe("the deadline is stated", () => {
  it("the vendor's request email and the customer's new awaiting-advance email both give it in IST, once each", async () => {
    const v = await vendor(); const h = await waiting(v);
    const [vendorMail] = await emails(h.id, "booking_request_vendor"), customerMail = await emails(h.id, "booking_request_customer");
    expect(customerMail).toHaveLength(1);
    expect(customerMail[0].recipient).toBe(h.email);
    expect(vendorMail.text_body).toMatch(/Record it by .+ IST\./);
    expect(customerMail[0].text_body).toMatch(/reserved until .+ IST\./);
    expect(customerMail[0].subject).toMatch(/ IST$/);
    expect(customerMail[0].text_body).toContain("/b/");
  });
});

describe("the reminder about 6 hours before", () => {
  it("goes to both sides once, however many reads or overlapping sweeps see it", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, 5 * HOUR);
    await Promise.all([settleDeadlines(v.id), settleDeadlines(v.id), call("GET", `/v1/vendor/bookings/${h.id}`, { cookie: v.cookie }), call("GET", `/v1/bookings/${h.id}`, { token: h.token })]);
    await settleDeadlines(v.id);
    const sent = await emails(h.id, "advance_deadline_reminder");
    expect(sent.map(mail => mail.recipient).sort()).toEqual([h.email, v.ownerEmail].sort());
    expect(sent.every(mail => / IST/.test(mail.text_body))).toBe(true);
  });
  it("waits until the last 6 hours, and is not sent once the advance is recorded", async () => {
    const v = await vendor(); const early = await waiting(v);
    await setDeadline(early.id, 7 * HOUR);
    await settleDeadlines(v.id);
    expect(await emails(early.id, "advance_deadline_reminder")).toHaveLength(0);
    expect((await record(v, early.id)).status).toBe(201);
    await setDeadline(early.id, 5 * HOUR);
    await settleDeadlines(v.id);
    expect(await status(early.id)).toBe("CONFIRMED");
    expect(await emails(early.id, "advance_deadline_reminder")).toHaveLength(0);
  });
  it("never goes to a booking paying online, whose 15 minutes are always inside the 6 hours", async () => {
    const v = await vendor(); const h = await held(v);
    await pool.query("UPDATE bookings SET terms_accepted_at=now() WHERE id=$1", [h.id]);
    await transaction(db => transitionBooking(db, h.id, "PENDING", "client", "terms accepted, advance to be paid online"));
    await settleDeadlines(v.id);
    expect(await emails(h.id, "advance_deadline_reminder")).toHaveLength(0);
  });
  it("the vendor's reminder setting is respected; the customer still hears", async () => {
    const v = await vendor(); const h = await waiting(v);
    await pool.query("UPDATE vendors SET notify_prefs=notify_prefs || '{\"reminder_24h\":false}'::jsonb WHERE id=$1", [v.id]);
    await setDeadline(h.id, 5 * HOUR);
    await settleDeadlines(v.id);
    expect((await emails(h.id, "advance_deadline_reminder")).map(mail => mail.recipient)).toEqual([h.email]);
  });
});

describe("when the deadline passes", () => {
  it.each([
    ["the vendor opening the booking", async (v: Vendor, id: string) => { await call("GET", `/v1/vendor/bookings/${id}`, { cookie: v.cookie }); }],
    ["the vendor opening the dashboard", async (v: Vendor) => { await call("GET", "/v1/vendor/overview", { cookie: v.cookie }); }],
    ["the vendor's booking list", async (v: Vendor) => { await call("GET", "/v1/vendor/bookings", { cookie: v.cookie }); }]
  ])("%s expires it through transitionBooking, no tick, with one email each way", async (_case, read) => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    await read(v, h.id); await read(v, h.id);
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    const events = (await pool.query("SELECT from_status,to_status,actor FROM booking_events WHERE booking_id=$1 AND to_status='EXPIRED'", [h.id])).rows;
    expect(events).toEqual([{ from_status: "PENDING", to_status: "EXPIRED", actor: "system" }]);
    expect((await emails(h.id, "advance_deadline_expired")).map(mail => mail.recipient).sort()).toEqual([h.email, v.ownerEmail].sort());
    expect(await offered(v)).toBe(true);
  });
  it("the customer opening their booking does the same", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    expect((await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body.status).toBe("EXPIRED");
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    await expect.poll(async () => (await emails(h.id, "advance_deadline_expired")).length).toBe(2);
  });
  it("another customer holding the time expires it too, and the first customer is told", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    await held(v);
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    await expect.poll(async () => (await emails(h.id, "advance_deadline_expired")).length).toBe(2);
  });
  it("a plain 15-minute hold that lapses sends no expiry email", async () => {
    const v = await vendor(); const h = await held(v);
    await setDeadline(h.id, -60_000);
    await settleDeadlines(v.id);
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    await expect.poll(async () => (await emails(h.id, "advance_deadline_expired")).length).toBe(0);
  });
  it("recording the advance late is refused, says to extend first, and nothing is recorded", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    const late = await record(v, h.id);
    expect(late.status).toBe(409);
    expect(late.body.error).toMatchObject({ code: "ADVANCE_DEADLINE_PASSED", details: { can_extend: true } });
    expect(late.body.error.message).toContain("Extend the deadline first");
    expect((await pool.query("SELECT 1 FROM payments WHERE booking_id=$1", [h.id])).rowCount).toBe(0);
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    await expect.poll(async () => (await emails(h.id, "advance_deadline_expired")).length).toBe(2);
  });
  it("the tick still works as the backstop, and adds nothing a read already did", async () => {
    const v = await vendor(); const passed = await waiting(v), soon = await waiting(v, `${day}T09:30:00.000Z`);
    await setDeadline(passed.id, -60_000); await setDeadline(soon.id, 5 * HOUR);
    await runTick("tick");
    await expect.poll(() => status(passed.id)).toBe("EXPIRED");
    await expect.poll(async () => (await emails(passed.id, "advance_deadline_expired")).length).toBe(2);
    expect(await emails(soon.id, "advance_deadline_reminder")).toHaveLength(2);
    await settleDeadlines(v.id); await runTick("tick");
    await expect.poll(async () => (await emails(passed.id, "advance_deadline_expired")).length).toBe(2);
    expect(await emails(soon.id, "advance_deadline_reminder")).toHaveLength(2);
  });
});

describe("extending the deadline", () => {
  const deadlineOf = async (id: string) => (await pool.query<{ hold_expires_at: Date }>("SELECT hold_expires_at FROM bookings WHERE id=$1", [id])).rows[0].hold_expires_at.getTime();
  const extend = (v: Vendor, id: string, body: unknown) => call("POST", `/v1/vendor/bookings/${id}/deadline`, { cookie: v.cookie, body });

  it("24 or 48 hours adds to the current deadline, is audited, shows on the timeline and tells the customer", async () => {
    const v = await vendor(); const h = await waiting(v); const before = await deadlineOf(h.id);
    const reply = await extend(v, h.id, { hours: 24 });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    expect(await deadlineOf(h.id)).toBe(before + 24 * HOUR);
    expect(await status(h.id)).toBe("PENDING");
    const audit = (await pool.query("SELECT actor_user_id,metadata FROM audit_logs WHERE action='booking.deadline_extended' AND resource_id=$1", [h.id])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(v.ownerId);
    expect(new Date(audit[0].metadata.from_deadline).getTime()).toBe(before);
    expect((await pool.query("SELECT 1 FROM booking_events WHERE booking_id=$1 AND reason='deadline extended' AND actor='vendor'", [h.id])).rowCount).toBe(1);
    const told = await emails(h.id, "advance_deadline_extended");
    expect(told.map(mail => mail.recipient)).toEqual([h.email]);
    expect(told[0].text_body).toMatch(/reserved until .+ IST\./);
  });
  it("a custom time is allowed up to the booking's start and refused past it, or before the current deadline", async () => {
    const v = await vendor(); const h = await waiting(v); const before = await deadlineOf(h.id);
    const past = await extend(v, h.id, { until: new Date(new Date(start).getTime() + 60_000).toISOString() });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe("INVALID_DEADLINE");
    expect((await extend(v, h.id, { until: new Date(before - HOUR).toISOString() })).body.error.code).toBe("INVALID_DEADLINE");
    expect(await deadlineOf(h.id)).toBe(before);
    expect((await extend(v, h.id, { until: start })).status).toBe(200);
    expect(await deadlineOf(h.id)).toBe(new Date(start).getTime());
  });
  it("after the deadline it brings the booking back through transitionBooking, then the advance can be recorded", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    expect((await record(v, h.id)).status).toBe(409);
    const now = Date.now();
    expect((await extend(v, h.id, { hours: 48 })).status).toBe(200);
    expect(await status(h.id)).toBe("PENDING");
    expect(await deadlineOf(h.id)).toBeGreaterThan(now + 47 * HOUR);
    expect((await pool.query("SELECT from_status,to_status,actor FROM booking_events WHERE booking_id=$1 AND reason='deadline extended'", [h.id])).rows).toEqual([{ from_status: "EXPIRED", to_status: "PENDING", actor: "vendor" }]);
    expect(await offered(v)).toBe(false);
    expect((await record(v, h.id)).body).toMatchObject({ confirmed: true });
    expect(await status(h.id)).toBe("CONFIRMED");
  });
  it("after the deadline, if someone else took the time, it stays expired and says so", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    await held(v);
    const reply = await extend(v, h.id, { hours: 24 });
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("SLOT_TAKEN");
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE action='booking.deadline_extended' AND resource_id=$1", [h.id])).rowCount).toBe(0);
  });
  it("after the deadline, time off put over the slot also keeps it expired", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, -60_000);
    await settleDeadlines(v.id);
    await pool.query("INSERT INTO blocked_periods(id,vendor_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,'Away')", [randomUUID(), v.id, new Date(start), new Date(new Date(start).getTime() + HOUR)]);
    expect((await extend(v, h.id, { hours: 24 })).body.error.code).toBe("BOOKING_CONFLICT");
    await expect.poll(() => status(h.id)).toBe("EXPIRED");
  });
  it("a new deadline gets its own reminder, and its own expiry email if it passes too", async () => {
    const v = await vendor(); const h = await waiting(v);
    await setDeadline(h.id, 5 * HOUR);
    await settleDeadlines(v.id);
    expect(await emails(h.id, "advance_deadline_reminder")).toHaveLength(2);
    await setDeadline(h.id, -60_000);
    await settleDeadlines(v.id);
    await extend(v, h.id, { hours: 24 });
    await setDeadline(h.id, 4 * HOUR);
    await settleDeadlines(v.id);
    expect(await emails(h.id, "advance_deadline_reminder")).toHaveLength(4);
    // Two minutes, not one: a deadline is named to the second, and this one must differ from the deadline above.
    await setDeadline(h.id, -120_000);
    await settleDeadlines(v.id);
    await expect.poll(async () => (await emails(h.id, "advance_deadline_expired")).length).toBe(4);
  });
  it("only an unpaid offline wait can be extended, and only by its own vendor", async () => {
    const v = await vendor(), other = await vendor(); const h = await waiting(v);
    expect((await extend(other, h.id, { hours: 24 })).status).toBe(404);
    expect((await record(v, h.id)).status).toBe(201);
    expect((await extend(v, h.id, { hours: 24 })).body.error.code).toBe("DEADLINE_NOT_EXTENDABLE");
    const plain = await held(v, `${day}T09:30:00.000Z`);
    expect((await extend(v, plain.id, { hours: 24 })).body.error.code).toBe("DEADLINE_NOT_EXTENDABLE");
    expect((await extend(v, plain.id, { hours: 12 })).status).toBe(400);
  });
  it("the booking page offers Extend while it can work, and not after the advance is recorded", async () => {
    const v = await vendor(); const h = await waiting(v);
    expect((await call("GET", `/v1/vendor/bookings/${h.id}`, { cookie: v.cookie })).body.actions.extend_deadline).toBe(true);
    await setDeadline(h.id, -60_000);
    expect((await call("GET", `/v1/vendor/bookings/${h.id}`, { cookie: v.cookie })).body.actions).toMatchObject({ extend_deadline: true, record_payment: false });
    await extend(v, h.id, { hours: 24 });
    await record(v, h.id);
    expect((await call("GET", `/v1/vendor/bookings/${h.id}`, { cookie: v.cookie })).body.actions.extend_deadline).toBe(false);
  });
});

describe("dashboard home fields (P15)", () => {
  it("advances to record carry their deadline, soonest first; a passed deadline asks to extend; the month's advances are totalled", async () => {
    const v = await vendor(); const later = await waiting(v), sooner = await waiting(v, `${day}T09:30:00.000Z`), passed = await waiting(v, `${day}T07:30:00.000Z`), paid = await waiting(v, `${day}T05:30:00.000Z`);
    await setDeadline(sooner.id, 3 * HOUR); await setDeadline(later.id, 30 * HOUR); await setDeadline(passed.id, -60_000);
    expect((await record(v, paid.id)).status).toBe(201);
    const overview = (await call("GET", "/v1/vendor/overview", { cookie: v.cookie })).body;
    const todo = overview.todo as { kind: string; id: string; hold_expires_at: string | null }[];
    expect(todo.map(row => [row.kind, row.id])).toEqual([["deadline_passed", passed.id], ["record_advance", sooner.id], ["record_advance", later.id]]);
    expect(new Date(todo[1].hold_expires_at!).getTime()).toBeGreaterThan(Date.now());
    expect(overview.money.advance_month_paise).toBe(20000);
  });
});

describe("the offline payment note (P16)", () => {
  it("is optional for a method that says enough, required for Other, and a short one is still refused", async () => {
    const v = await vendor(); const a = await waiting(v), b = await waiting(v, `${day}T09:30:00.000Z`);
    expect((await record(v, a.id, { method: "other" })).status).toBe(400);
    expect((await record(v, a.id, { method: "cash", note: "x" })).status).toBe(400);
    expect((await record(v, a.id, { method: "cash" })).body).toMatchObject({ confirmed: true });
    expect((await pool.query<{ note: string }>("SELECT note FROM payments WHERE booking_id=$1", [a.id])).rows[0].note).toBe("Recorded by the business");
    expect((await record(v, b.id, { method: "other", note: "Paid by cheque" })).status).toBe(201);
  });
});
