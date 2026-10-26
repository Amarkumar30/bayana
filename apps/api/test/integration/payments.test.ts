import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { expireOverdueHolds } from "../../src/booking-transition.js";
import { pool, transaction } from "../../src/database.js";
import { createLogger, setLogger } from "../../src/logger.js";
import { FakeProvider } from "../../src/payments/fake-provider.js";
import { reconcile } from "../../src/payments/reconcile.js";
import { applyProviderRefund } from "../../src/payments/service.js";
import { useTestPayments } from "../../src/payments/runtime.js";
import { createUser } from "../helpers.js";

// SPEC 11 / PY-01..PY-11 against FakeProvider: no network, no keys. Every money path goes through the real HTTP routes.
let server: ReturnType<typeof app.listen>; let base = ""; let fake: FakeProvider;
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
beforeEach(() => { fake = new FakeProvider(); useTestPayments({ mode: "test", provider: fake }); });
afterAll(async () => { useTestPayments(null); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; body: Record<string, any>; headers: Headers; bytes: Buffer };
async function call(method: string, path: string, options: { cookie?: string; token?: string; body?: unknown; raw?: string; headers?: Record<string, string>; key?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-booking-token": options.token } : {}), ...(options.key ? { "idempotency-key": options.key } : {}), ...options.headers }, body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)) });
  const bytes = Buffer.from(await response.arrayBuffer()); const text = bytes.toString("utf8");
  let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, headers: response.headers, bytes };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;
const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const nineIst = `${day}T03:30:00.000Z`;

async function vendor() {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `pay-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Studio Pay','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value,cancellation_tiers) VALUES($1,$2,'Session',100000,60,'hourly','PERCENT',20,$3)", [serviceId, id, JSON.stringify([{ min_hours_before: 48, refund_percent: 50 }])]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerCookie: await sessionFor(owner.id) };
}
/** A booking that has agreed to the terms and waits for its Rs 200 advance (PENDING, 15-minute hold). */
async function pending(v?: Awaited<ReturnType<typeof vendor>>) {
  v ??= await vendor();
  const customer = await createUser(pool, { role: "CLIENT" }); const cookie = await sessionFor(customer.id);
  const held = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: nineIst, name: "Asha Rao" } });
  expect(held.status).toBe(201);
  const id = held.body.booking.id as string, token = held.body.booking.access_token as string;
  const view = await call("GET", `/v1/bookings/${id}`, { token });
  expect((await call("POST", `/v1/bookings/${id}/accept`, { token, body: { terms_hash: view.body.contract_preview.sha256, accepted: true } })).body.booking.status).toBe("PENDING");
  return { id, token, cookie, vendor: v };
}
const order = async (booking: { id: string; token: string }) => { const reply = await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: {} }); expect(reply.status).toBe(200); return reply.body as { order_id: string; key_id: string; amount_paise: number }; };
const verify = (booking: { id: string; token: string }, checkout: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => call("POST", `/v1/bookings/${booking.id}/payment-verify`, { token: booking.token, body: checkout });
const status = async (id: string) => (await pool.query<{ status: string }>("SELECT status FROM bookings WHERE id=$1", [id])).rows[0].status;
const counts = async (id: string) => (await pool.query("SELECT (SELECT count(*)::int FROM payments WHERE booking_id=$1 AND status='captured') AS captured, (SELECT count(*)::int FROM ledger_entries WHERE booking_id=$1 AND kind='PAYMENT') AS ledger, (SELECT count(*)::int FROM booking_events WHERE booking_id=$1 AND to_status='CONFIRMED') AS confirmations", [id])).rows[0];

let eventCounter = 0;
async function webhook(event: string, entities: Record<string, unknown>, options: { eventId?: string; signature?: string } = {}) {
  const raw = JSON.stringify({ entity: "event", event, payload: Object.fromEntries(Object.entries(entities).map(([name, entity]) => [name, { entity }])), created_at: Math.floor(Date.now() / 1000) });
  const eventId = options.eventId ?? `evt_test_${Date.now()}_${++eventCounter}`;
  const reply = await call("POST", "/webhooks/razorpay", { raw, headers: { "x-razorpay-signature": options.signature ?? fake.webhookSignature(raw), "x-razorpay-event-id": eventId } });
  return { reply, eventId };
}
/** The route answers first and processes after; wait until the event is settled one way or the other. */
async function settled(eventId: string, options: { processed?: boolean } = {}) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = (await pool.query<{ processed_at: Date | null; error: string | null }>("SELECT processed_at,error FROM webhook_events WHERE event_id=$1", [eventId])).rows[0];
    // A "Waiting" event is retried after the payment it waits for, so { processed } waits past that error.
    if (row && (row.processed_at || (row.error && !options.processed))) return row;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`webhook ${eventId} never settled`);
}

describe("orders (PY-02)", () => {
  it("are created from the snapshot, ignore a tampered amount, and repeat requests reuse the open order", async () => {
    const booking = await pending();
    const first = await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: { amount_paise: 1, currency: "USD" } });
    expect(first.body).toMatchObject({ amount_paise: 20000, currency: "INR", key_id: fake.keyId, reused: false });
    const again = await Promise.all(Array.from({ length: 5 }, () => order(booking)));
    expect(new Set(again.map(value => value.order_id))).toEqual(new Set([first.body.order_id]));
    expect(fake.calls.filter(name => name === "createOrder")).toHaveLength(1);
    expect(fake.orders.get(first.body.order_id)).toMatchObject({ amount: 20000, currency: "INR", receipt: `bk_${booking.id.replace(/-/g, "").slice(0, 20)}` });
    expect((await pool.query("SELECT count(*)::int AS n FROM payments WHERE booking_id=$1", [booking.id])).rows[0].n).toBe(1);
  });
  it("answer PAYMENT_DISABLED when payments are off, and refuse live mode outright", async () => {
    const booking = await pending();
    useTestPayments({ mode: "disabled", provider: fake });
    expect((await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: {} })).body.error.code).toBe("PAYMENT_DISABLED");
    useTestPayments({ mode: "live", provider: fake });
    expect((await call("POST", `/v1/bookings/${booking.id}/payment-order`, { token: booking.token, body: {} })).body.error.code).toBe("PAYMENT_LIVE_REFUSED");
    expect(fake.calls).toEqual([]);
  });
  it("need the booking's token or customer; a vendor or stranger gets 404", async () => {
    const booking = await pending();
    expect((await call("POST", `/v1/bookings/${booking.id}/payment-order`, { body: {} })).status).toBe(404);
    expect((await call("POST", `/v1/bookings/${booking.id}/payment-order`, { cookie: booking.vendor.ownerCookie, body: {} })).status).toBe(404);
  });
});

describe("checkout verification (PY-03, PY-05)", () => {
  it("confirms only after the signature, the gateway record, the amount and the currency all match", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const checkout = fake.pay(order_id);
    const reply = await verify(booking, { razorpay_order_id: checkout.razorpay_order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ outcome: "confirmed", booking: { status: "CONFIRMED", paid_paise: 20000, balance_due_paise: 80000 } });
    expect(await counts(booking.id)).toEqual({ captured: 1, ledger: 1, confirmations: 1 });
    expect((await pool.query("SELECT subject FROM email_outbox WHERE booking_id=$1 AND subject LIKE 'Booking confirmed%'", [booking.id])).rowCount).toBe(1);
    // Repeating the same verified payment changes nothing.
    expect((await verify(booking, { razorpay_order_id: checkout.razorpay_order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature })).body.outcome).toBe("already");
    expect(await counts(booking.id)).toEqual({ captured: 1, ledger: 1, confirmations: 1 });
  });
  it("a bad signature returns 400 and confirms nothing, without asking the gateway", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const checkout = fake.pay(order_id); fake.calls.length = 0;
    const reply = await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: "f".repeat(64) });
    expect(reply).toMatchObject({ status: 400, body: { error: { code: "PAYMENT_SIGNATURE_INVALID" } } });
    expect(fake.calls).toEqual([]);
    expect(await status(booking.id)).toBe("PENDING");
  });
  it("a tampered amount or a wrong currency at the gateway is refused and flagged for review", async () => {
    for (const tamper of [{ amount: 100 }, { currency: "USD" }]) {
      const booking = await pending(); const { order_id } = await order(booking);
      const checkout = fake.pay(order_id, tamper);
      const reply = await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature });
      expect(reply).toMatchObject({ status: 409, body: { error: { code: "PAYMENT_MISMATCH" } } });
      expect(await status(booking.id)).toBe("PENDING");
      expect(await counts(booking.id)).toEqual({ captured: 0, ledger: 0, confirmations: 0 });
      expect((await pool.query("SELECT 1 FROM audit_logs WHERE resource_id=$1 AND action='payment.mismatch_review'", [booking.id])).rowCount).toBe(1);
    }
  });
  it("a payment for another booking's order is refused (wrong order id)", async () => {
    const mine = await pending(), theirs = await pending();
    const myOrder = await order(mine), theirOrder = await order(theirs);
    const paidTheirs = fake.pay(theirOrder.order_id);
    // Their valid checkout presented on my booking: the order is not mine.
    expect((await verify(mine, { razorpay_order_id: paidTheirs.razorpay_order_id, razorpay_payment_id: paidTheirs.razorpay_payment_id, razorpay_signature: paidTheirs.razorpay_signature })).body.error.code).toBe("PAYMENT_ORDER_MISMATCH");
    // A correctly signed pair of my order id and their payment id: the gateway says the payment belongs to another order.
    expect((await verify(mine, { razorpay_order_id: myOrder.order_id, razorpay_payment_id: paidTheirs.razorpay_payment_id, razorpay_signature: fake.checkoutSignature(myOrder.order_id, paidTheirs.razorpay_payment_id) })).body.error.code).toBe("PAYMENT_MISMATCH");
    expect([await status(mine.id), await status(theirs.id)]).toEqual(["PENDING", "PENDING"]);
  });
  it("an authorized but not captured payment does not confirm; the captured webhook does", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const checkout = fake.pay(order_id, { status: "authorized" });
    const reply = await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature });
    expect(reply).toMatchObject({ status: 202, body: { outcome: "authorized", booking: { status: "PENDING", paid_paise: 0 } } });
    expect((await pool.query("SELECT status FROM payments WHERE provider_order_id=$1", [order_id])).rows[0].status).toBe("authorized");
    const { eventId } = await webhook("payment.captured", { payment: { ...checkout.payment, status: "captured" } });
    await settled(eventId);
    expect(await status(booking.id)).toBe("CONFIRMED");
  });
  it("a failed attempt leaves the booking pending and the same order can be retried", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const failed = fake.pay(order_id, { status: "failed" });
    expect((await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: failed.razorpay_payment_id, razorpay_signature: failed.razorpay_signature })).body.error.code).toBe("PAYMENT_FAILED");
    expect(await status(booking.id)).toBe("PENDING");
    expect((await order(booking)).order_id).toBe(order_id);
    const retry = fake.pay(order_id);
    expect((await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: retry.razorpay_payment_id, razorpay_signature: retry.razorpay_signature })).body.outcome).toBe("confirmed");
  });
});

describe("webhooks (PY-04)", () => {
  it("a bad signature is rejected and stores nothing", async () => {
    const { reply, eventId } = await webhook("payment.captured", { payment: { id: "pay_x", order_id: "order_x", amount: 1, currency: "INR", status: "captured" } }, { signature: "0".repeat(64) });
    expect(reply).toMatchObject({ status: 400, body: { error: { code: "INVALID_WEBHOOK_SIGNATURE" } } });
    expect((await pool.query("SELECT 1 FROM webhook_events WHERE event_id=$1", [eventId])).rowCount).toBe(0);
  });
  it("confirms a booking with no browser verify at all (closed tab), and a duplicate event changes nothing", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const { payment } = fake.pay(order_id);
    const first = await webhook("payment.captured", { payment });
    expect(first.reply).toMatchObject({ status: 200, body: { ok: true } });
    await settled(first.eventId);
    expect(await status(booking.id)).toBe("CONFIRMED");
    const repeat = await webhook("payment.captured", { payment }, { eventId: first.eventId });
    expect(repeat.reply).toMatchObject({ status: 200, body: { ok: true, duplicate: true } });
    expect(await counts(booking.id)).toEqual({ captured: 1, ledger: 1, confirmations: 1 });
  });
  it("a mismatched amount is stored with an error, flagged for review and not applied", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const { payment } = fake.pay(order_id);
    const { eventId } = await webhook("payment.captured", { payment: { ...payment, amount: 999 } });
    expect(await settled(eventId)).toMatchObject({ error: expect.stringContaining("amount differs") });
    expect((await pool.query("SELECT needs_review FROM webhook_events WHERE event_id=$1", [eventId])).rows[0].needs_review).toBe(true);
    expect(await status(booking.id)).toBe("PENDING");
  });
  it("verify and webhook racing each other give exactly one confirmation and one payment row", async () => {
    for (let run = 0; run < 5; run++) {
      const booking = await pending(); const { order_id } = await order(booking);
      const checkout = fake.pay(order_id);
      const [, hook] = await Promise.all([
        verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature }),
        webhook("payment.captured", { payment: checkout.payment }),
        webhook("order.paid", { payment: checkout.payment, order: { id: order_id } })
      ]);
      await settled(hook.eventId);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(await counts(booking.id)).toEqual({ captured: 1, ledger: 1, confirmations: 1 });
    }
  });
  it("tolerates any order: order.paid before payment.captured, and a refund event before its payment is known", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const { payment } = fake.pay(order_id);
    const refund = await fake.createRefund({ paymentId: payment.id, amountPaise: 5000 });
    const early = await webhook("refund.processed", { refund, payment });
    expect(await settled(early.eventId)).toMatchObject({ error: expect.stringContaining("Waiting") });
    const paid = await webhook("order.paid", { payment, order: { id: order_id } }); await settled(paid.eventId);
    const captured = await webhook("payment.captured", { payment }); await settled(captured.eventId);
    expect(await settled(early.eventId, { processed: true })).toMatchObject({ error: null });
    expect(await counts(booking.id)).toEqual({ captured: 0, ledger: 1, confirmations: 1 });
    expect((await pool.query("SELECT status FROM payments WHERE provider_order_id=$1", [order_id])).rows[0].status).toBe("partially_refunded");
    expect((await call("GET", `/v1/bookings/${booking.id}`, { token: booking.token })).body).toMatchObject({ status: "CONFIRMED", paid_paise: 15000, balance_due_paise: 85000 });
  });
  it("two retries applying one gateway refund at once record it once and neither fails", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const { payment } = fake.pay(order_id);
    await settled((await webhook("payment.captured", { payment })).eventId);
    const refund = await fake.createRefund({ paymentId: payment.id, amountPaise: 5000 });
    await Promise.all([applyProviderRefund(refund, "processed"), applyProviderRefund(refund, "processed")]);
    expect((await pool.query("SELECT count(*)::int AS n FROM refunds WHERE provider_refund_id=$1", [refund.id])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM ledger_entries WHERE booking_id=$1 AND kind='REFUND'", [booking.id])).rows[0].n).toBe(1);
  });
});

describe("late payment after the hold expired (PY-06)", () => {
  it("re-claims the slot when it is still free and confirms", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [booking.id]);
    await transaction(db => expireOverdueHolds(db, null));
    expect(await status(booking.id)).toBe("EXPIRED");
    const checkout = fake.pay(order_id);
    expect((await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature })).body.outcome).toBe("reclaimed");
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect((await pool.query("SELECT from_status FROM booking_events WHERE booking_id=$1 AND to_status='CONFIRMED'", [booking.id])).rows[0].from_status).toBe("EXPIRED");
  });
  it("refunds in full automatically and queues an email when someone else has the slot", async () => {
    const v = await vendor();
    const late = await pending(v); const { order_id } = await order(late);
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [late.id]);
    const other = await pending(v); // its hold creation expires the late booking lazily and takes the same time
    expect(await status(late.id)).toBe("EXPIRED");
    const { payment } = fake.pay(order_id);
    const { eventId } = await webhook("payment.captured", { payment }); await settled(eventId);
    expect(await status(late.id)).toBe("EXPIRED_PAID");
    expect(await status(other.id)).toBe("PENDING");
    expect((await pool.query("SELECT status,amount_paise::int AS amount,provider_refund_id IS NOT NULL AS sent FROM refunds WHERE booking_id=$1", [late.id])).rows).toEqual([{ status: "processed", amount: 20000, sent: true }]);
    expect([...fake.refunds.values()].map(refund => refund.amount)).toEqual([20000]);
    expect((await pool.query("SELECT 1 FROM email_outbox WHERE booking_id=$1 AND template='refund_issued'", [late.id])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM email_outbox WHERE booking_id=$1 AND template='payment_review'", [late.id])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE resource_id=$1 AND action='payment.auto_refund_review'", [late.id])).rowCount).toBe(1);
  });
});

describe("refunds (PY-08)", () => {
  it("the refund issued on cancellation equals the preview the customer saw", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const checkout = fake.pay(order_id);
    await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature });
    const preview = (await call("GET", `/v1/bookings/${booking.id}`, { token: booking.token })).body.refund_preview;
    expect(preview).toEqual({ refund_paise: 10000, refund_percent: 50, paid_paise: 20000 });
    const cancelled = await call("POST", `/v1/bookings/${booking.id}/cancel`, { token: booking.token, body: {} });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", paid_paise: 10000 });
    expect([...fake.refunds.values()].map(refund => refund.amount)).toEqual([preview.refund_paise]);
    const rows = (await pool.query("SELECT r.status,r.amount_paise::int AS amount,p.status AS payment_status FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.booking_id=$1", [booking.id])).rows;
    expect(rows).toEqual([{ status: "processed", amount: preview.refund_paise, payment_status: "partially_refunded" }]);
    // The refund.processed webhook that follows is a no-op.
    const refund = [...fake.refunds.values()][0];
    const { eventId } = await webhook("refund.processed", { refund }); await settled(eventId);
    expect((await pool.query("SELECT count(*)::int AS n FROM ledger_entries WHERE booking_id=$1 AND kind='REFUND'", [booking.id])).rows[0].n).toBe(1);
  });
});

describe("offline payments, balance and receipts (PY-07, PY-10, PY-11)", () => {
  it("records an audited offline advance that confirms the booking, keeps the balance equal to the payment rows and the ledger", async () => {
    useTestPayments({ mode: "disabled", provider: null });
    const booking = await pending();
    const path = `/v1/vendor/bookings/${booking.id}/offline-payments`;
    expect((await call("POST", path, { cookie: booking.vendor.ownerCookie, body: { kind: "advance", amount_paise: 20000, method: "cash", note: "" } })).status).toBe(400);
    expect((await call("POST", path, { cookie: booking.vendor.ownerCookie, body: { kind: "advance", amount_paise: 200000, method: "cash", note: "Too much" } })).body.error.code).toBe("AMOUNT_EXCEEDS_BALANCE");
    const advance = await call("POST", path, { cookie: booking.vendor.ownerCookie, body: { kind: "advance", amount_paise: 20000, method: "upi", note: "UPI to the studio account, ref 4411" } });
    expect(advance).toMatchObject({ status: 201, body: { confirmed: true } });
    expect(await status(booking.id)).toBe("CONFIRMED");
    expect((await pool.query("SELECT action FROM audit_logs WHERE resource_id=$1 ORDER BY created_at", [booking.id])).rows.map(row => row.action)).toEqual(["payment.offline_recorded", "booking.manual_confirmation"]);
    expect((await pool.query("SELECT channel FROM ledger_entries WHERE booking_id=$1", [booking.id])).rows).toEqual([{ channel: "offline" }]);
    await expect(pool.query("UPDATE audit_logs SET action='x' WHERE resource_id=$1", [booking.id])).rejects.toMatchObject({ code: "42501" });
    const balance = await call("POST", path, { cookie: booking.vendor.ownerCookie, body: { kind: "balance", amount_paise: 30000, method: "cash", note: "Part of the balance in cash" } });
    expect(balance.status).toBe(201);
    // PY-07: the same numbers for the customer and the vendor, equal to the payment rows and to the ledger.
    const customerView = (await call("GET", `/v1/bookings/${booking.id}`, { token: booking.token })).body, vendorView = (await call("GET", `/v1/bookings/${booking.id}`, { cookie: booking.vendor.ownerCookie })).body;
    for (const view of [customerView, vendorView]) expect(view).toMatchObject({ paid_paise: 50000, balance_due_paise: 50000 });
    expect(vendorView.payments.map((payment: { note: string }) => payment.note)).toEqual(["UPI to the studio account, ref 4411", "Part of the balance in cash"]);
    expect(customerView.payments.every((payment: { note: string | null }) => payment.note === null)).toBe(true);
    const sums = (await pool.query("SELECT (SELECT SUM(amount_paise)::int FROM payments WHERE booking_id=$1) AS rows, (SELECT -SUM(amount_paise)::int FROM ledger_entries WHERE booking_id=$1) AS ledger", [booking.id])).rows[0];
    expect(sums).toEqual({ rows: 50000, ledger: 50000 });
    // The receipt PDF carries the same totals as the ledger.
    const receipt = await call("GET", `/v1/bookings/${booking.id}/receipts/${balance.body.payment_id}`, { token: booking.token });
    expect(receipt.status).toBe(200); expect(receipt.headers.get("content-type")).toBe("application/pdf");
    expect(receipt.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(receipt.bytes);
    expect(pdf.getKeywords()).toBe("amount=30000 total=100000 paid=50000 refunded=0 balance=50000");
    expect((await call("GET", `/v1/bookings/${booking.id}/receipts/${randomUUID()}`, { token: booking.token })).status).toBe(404);
  });
});

describe("reconcile (PY-09)", () => {
  it("reports a payment captured at the gateway that the ledger never recorded, and changes nothing", async () => {
    const booking = await pending(); const { order_id } = await order(booking);
    const { payment } = fake.pay(order_id); // paid, but neither verify nor webhook ever arrived
    const before = await counts(booking.id);
    const report = await reconcile(pool, fake, { hours: 1 });
    expect(report.differences).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "missing_capture", booking_id: booking.id, provider_id: payment.id, provider_paise: 20000 })]));
    expect(await counts(booking.id)).toEqual(before);
  });
});

describe("logs never contain keys, secrets or signatures", () => {
  it("across order, verify (good and bad), mismatch and webhook paths", async () => {
    const lines: string[] = [];
    setLogger(createLogger(new Writable({ write(chunk, _encoding, done) { lines.push(String(chunk)); done(); } }), "info"));
    try {
      const booking = await pending(); const { order_id } = await order(booking);
      const checkout = fake.pay(order_id, { amount: 1 });
      await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: "a".repeat(64) });
      await verify(booking, { razorpay_order_id: order_id, razorpay_payment_id: checkout.razorpay_payment_id, razorpay_signature: checkout.razorpay_signature });
      const { eventId } = await webhook("payment.captured", { payment: checkout.payment });
      await settled(eventId);
      await webhook("payment.captured", { payment: checkout.payment }, { signature: "b".repeat(64) });
      const output = lines.join("\n");
      expect(output.length).toBeGreaterThan(0);
      for (const secret of ["fake_key_secret_for_tests", "fake_webhook_secret_for_tests", checkout.razorpay_signature, "a".repeat(64), "b".repeat(64), booking.token]) expect(output).not.toContain(secret);
    } finally { setLogger(createLogger()); }
  });
});
