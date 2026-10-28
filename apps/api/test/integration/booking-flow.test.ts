import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { pool, transaction } from "../../src/database.js";
import { createUser } from "../helpers.js";

// The customer flow over HTTP: hold after OTP, read the contract, agree, view by private link, cancel (SPEC 5.5, CT-02/03, BK-08).
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const nineIst = `${day}T03:30:00.000Z`;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
type Reply = { status: number; body: Record<string, any> };
async function call(method: string, path: string, options: { cookie?: string; token?: string; body?: unknown; key?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "user-agent": "flow-test/1.0", "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.token ? { "x-booking-token": options.token } : {}), ...(options.key ? { "idempotency-key": options.key } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;

async function vendor(template = "Pay {{advance}} now for {{service_name}} on {{date}}.", tiers: unknown[] = [{ min_hours_before: 48, refund_percent: 50 }]) {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `flow-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,cancellation_policy,rescheduling_policy,phone_required) VALUES($1,$2,$3,'Studio Flow','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'The advance confirms the date.','See the refund tiers.','One free reschedule.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value,terms_template,cancellation_tiers) VALUES($1,$2,'Session',100000,60,'hourly','PERCENT',20,$3,$4)", [serviceId, id, template, JSON.stringify(tiers)]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerCookie: await sessionFor(owner.id) };
}
async function held(v: Awaited<ReturnType<typeof vendor>>) {
  const customer = await createUser(pool, { role: "CLIENT" }); const cookie = await sessionFor(customer.id);
  const created = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: nineIst, name: "Asha Rao", total_paise: 1 } });
  expect(created.status).toBe(201);
  return { id: created.body.booking.id as string, token: created.body.booking.access_token as string, cookie, email: customer.email, booking: created.body.booking };
}

describe("hold, contract and acceptance", () => {
  it("a hold is HELD for 15 minutes, ignores client prices and returns the private token once", async () => {
    const v = await vendor(); const h = await held(v);
    expect(h.booking).toMatchObject({ status: "HELD", total_paise: "100000", advance_paise: "20000" });
    expect(h.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const minutes = (new Date(h.booking.hold_expires_at).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14); expect(minutes).toBeLessThanOrEqual(15);
  });

  it("the preview is rendered with booking values and its hash is the SHA-256 of the exact text", async () => {
    const v = await vendor(); const h = await held(v);
    const view = await call("GET", `/v1/bookings/${h.id}`, { token: h.token });
    expect(view.status).toBe(200);
    const preview = view.body.contract_preview;
    expect(preview.body).toContain("Pay ₹200.00 now for Session on");
    expect(preview.body).toContain("Cancel at least 48 hours before the start: 50% of the advance is refunded.");
    expect(preview.body).toContain("Total price: ₹1,000.00");
    expect(preview.sha256).toBe(sha256(preview.body));
    expect(view.body).toMatchObject({ status: "HELD", payments_enabled: false, contract: null, balance_due_paise: 100000 });
  });

  it("accepting stores frozen text and evidence, moves to PENDING and is safe to repeat", async () => {
    const v = await vendor(); const h = await held(v);
    const { contract_preview: preview } = (await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body;
    expect((await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: "0".repeat(64), accepted: true } })).body.error.code).toBe("TERMS_CHANGED");
    const accepted = await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: preview.sha256, accepted: true } });
    expect(accepted.status).toBe(200);
    expect(accepted.body.booking.status).toBe("PENDING");
    // Without online payments the request waits for the vendor, so the hold lengthens beyond 15 minutes.
    expect(new Date(accepted.body.booking.hold_expires_at).getTime() - Date.now()).toBeGreaterThan(3_600_000);
    const evidence = (await pool.query("SELECT body,sha256,accepted_email::text AS email,ip,user_agent FROM booking_contracts WHERE booking_id=$1", [h.id])).rows[0];
    expect(evidence).toMatchObject({ body: preview.body, sha256: preview.sha256, email: h.email, user_agent: "flow-test/1.0" });
    expect(evidence.ip).toMatch(/^10\.88\./);
    expect((await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: preview.sha256, accepted: true } })).status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM booking_contracts WHERE booking_id=$1", [h.id])).rows[0].n).toBe(1);
  });

  it("a stored contract never changes: later template edits do not alter it and rewrites are rejected", async () => {
    const v = await vendor(); const h = await held(v);
    const { contract_preview: preview } = (await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body;
    await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: preview.sha256, accepted: true } });
    await pool.query("UPDATE services SET terms_template='Totally different {{price}}' WHERE id=$1", [v.serviceId]);
    await pool.query("UPDATE vendors SET terms='New terms' WHERE id=$1", [v.id]);
    const view = await call("GET", `/v1/bookings/${h.id}`, { token: h.token });
    expect(view.body.contract).toMatchObject({ body: preview.body, sha256: preview.sha256 });
    await expect(pool.query("UPDATE booking_contracts SET body='forged' WHERE booking_id=$1", [h.id])).rejects.toMatchObject({ code: "42501" });
    await expect(pool.query("DELETE FROM booking_contracts WHERE booking_id=$1", [h.id])).rejects.toMatchObject({ code: "42501" });
  });

  it("an expired hold cannot be accepted (HOLD_EXPIRED) and shows as expired before any sweep", async () => {
    const v = await vendor(); const h = await held(v);
    const { contract_preview: preview } = (await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body;
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 second' WHERE id=$1", [h.id]);
    const refused = await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: preview.sha256, accepted: true } });
    expect(refused).toMatchObject({ status: 409, body: { error: { code: "HOLD_EXPIRED" } } });
    expect((await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body).toMatchObject({ status: "EXPIRED", contract_preview: null, can_cancel: false });
  });

  it("a zero-advance service is confirmed on acceptance", async () => {
    const v = await vendor("");
    await pool.query("UPDATE services SET advance_type='NONE', advance_value=0 WHERE id=$1", [v.serviceId]);
    const h = await held(v);
    const { contract_preview: preview } = (await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body;
    expect((await call("POST", `/v1/bookings/${h.id}/accept`, { token: h.token, body: { terms_hash: preview.sha256, accepted: true } })).body.booking.status).toBe("CONFIRMED");
  });
});

describe("private booking link (BK-08)", () => {
  it("the token, the customer and the vendor can read it; a wrong token, another customer or a bad id get the same 404", async () => {
    const v = await vendor(); const h = await held(v);
    expect((await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).status).toBe(200);
    expect((await call("GET", `/v1/bookings/${h.id}`, { cookie: h.cookie })).status).toBe(200);
    expect((await call("GET", `/v1/bookings/${h.id}`, { cookie: v.ownerCookie })).body.viewer).toBe("vendor");
    const stranger = await sessionFor((await createUser(pool, { role: "CLIENT" })).id);
    const misses = [await call("GET", `/v1/bookings/${h.id}`, { token: h.token.slice(0, -1) + (h.token.endsWith("A") ? "B" : "A") }), await call("GET", `/v1/bookings/${h.id}`, { cookie: stranger }), await call("GET", "/v1/bookings/not-a-uuid", { token: h.token }), await call("GET", `/v1/bookings/${randomUUID()}`, { token: h.token })];
    for (const miss of misses) expect(miss).toEqual({ status: 404, body: { error: { code: "NOT_FOUND", message: "Not found", details: {} } } });
    // The vendor cannot agree to terms on the customer's behalf.
    expect((await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: v.ownerCookie, body: { terms_hash: "a".repeat(64), accepted: true } })).status).toBe(404);
  });
  it("the response never includes the token hash, the fingerprint or other customers' data", async () => {
    const v = await vendor(); const h = await held(v);
    const text = JSON.stringify((await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body);
    for (const secret of ["access_token_hash", "idempotency", h.token]) expect(text).not.toContain(secret);
  });
});

describe("cancellation with a refund preview", () => {
  it("previews the refund from the snapshotted tiers and records it on the cancellation event", async () => {
    const v = await vendor(); const h = await held(v);
    const { contract_preview: preview } = (await call("GET", `/v1/bookings/${h.id}`, { token: h.token })).body;
    expect((await call("POST", `/v1/bookings/${h.id}/cancel`, { token: h.token, body: {} })).status).toBe(409); // a hold just lapses
    await call("POST", `/v1/bookings/${h.id}/accept`, { cookie: h.cookie, body: { terms_hash: preview.sha256, accepted: true } });
    // An offline advance of Rs 200 recorded against the booking; 10 days out the 48-hour tier refunds 50%.
    expect((await call("POST", `/v1/vendor/bookings/${h.id}/offline-payments`, { cookie: v.ownerCookie, body: { kind: "balance", amount_paise: 20000, method: "upi", note: "UPI to the studio's own account" } })).status).toBe(201);
    await pool.query("UPDATE services SET cancellation_tiers='[]' WHERE id=$1", [v.serviceId]); // later edits do not apply
    const view = await call("GET", `/v1/bookings/${h.id}`, { token: h.token });
    expect(view.body).toMatchObject({ can_cancel: true, paid_paise: 20000, balance_due_paise: 80000, refund_preview: { refund_paise: 10000, refund_percent: 50, paid_paise: 20000 } });
    const cancelled = await call("POST", `/v1/bookings/${h.id}/cancel`, { token: h.token, body: { reason: "Plans changed" } });
    expect(cancelled.body).toMatchObject({ status: "CANCELLED", can_cancel: false });
    const event = (await pool.query("SELECT actor,reason,meta FROM booking_events WHERE booking_id=$1 AND to_status='CANCELLED'", [h.id])).rows[0];
    expect(event).toMatchObject({ actor: "customer", reason: "Plans changed", meta: { refund_paise: 10000, refund_percent: 50 } });
    // Money paid offline is refunded by the vendor directly, so the refund row is "manual", for the previewed amount.
    expect((await pool.query("SELECT status,amount_paise::int AS amount FROM refunds WHERE booking_id=$1", [h.id])).rows).toEqual([{ status: "manual", amount: 10000 }]);
    expect((await call("POST", `/v1/bookings/${h.id}/cancel`, { token: h.token, body: {} })).status).toBe(409);
  });
});

describe("public vendor page data", () => {
  it("says whether online payments are enabled", async () => {
    const v = await vendor();
    expect((await call("GET", `/v1/vendors/${v.slug}`)).body.payments_enabled).toBe(false);
  });
});
