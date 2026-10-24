import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { acceptTerms, createHold } from "../../src/booking-service.js";
import { expireOverdueHolds, transitionBooking } from "../../src/booking-transition.js";
import { loadContract } from "../../src/contract.js";
import { pool, transaction } from "../../src/database.js";
import { createUser } from "../helpers.js";

let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

// A published Asia/Kolkata vendor open 09:00-18:00 every day, with one 60-minute service (Rs 1,000, 20% advance).
const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
const nineIst = `${day}T03:30:00.000Z`, tenIst = `${day}T04:30:00.000Z`;
async function bookableVendor(advance: { type: "PERCENT" | "NONE"; value: number } = { type: "PERCENT", value: 20 }) {
  const owner = await createUser(pool); const vendorId = randomUUID(), serviceId = randomUUID(), slug = `engine-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms) VALUES($1,$2,$3,'Engine test','Delhi','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms the date.')", [vendorId, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Session',100000,60,'TIMED',$3,$4)", [serviceId, vendorId, advance.type, advance.value]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), vendorId, weekday]);
  return { vendorId, serviceId, slug, ownerId: owner.id };
}
async function client() { const user = await createUser(pool, { role: "CLIENT" }); return user; }
const holdInput = (vendor: { slug: string; serviceId: string }, user: { id: string; email: string }, overrides: Partial<Parameters<typeof createHold>[1]> = {}) =>
  ({ slug: vendor.slug, date: day, name: "Asha Rao", phone: "+919800000000", email: user.email, clientUserId: user.id, serviceId: vendor.serviceId, startsAt: nineIst, key: randomUUID(), ...overrides });
const hold = (input: Parameters<typeof createHold>[1]) => transaction(db => createHold(db, input));
/** Hold, then agree to the exact contract text (HELD -> PENDING, or CONFIRMED when nothing is due). */
async function accepted(input: Parameters<typeof createHold>[1]) {
  const booking = await hold(input); const contract = await loadContract(pool, booking.id);
  return (await transaction(db => acceptTerms(db, { bookingId: booking.id, termsHash: contract!.sha256, email: input.email, ip: "203.0.113.9", userAgent: "vitest" }))).booking;
}
const codeOf = (result: PromiseSettledResult<unknown>) => result.status === "rejected" ? (result.reason as { code?: string }).code : "OK";
const events = async (bookingId: string) => (await pool.query("SELECT from_status,to_status,actor FROM booking_events WHERE booking_id=$1 ORDER BY created_at", [bookingId])).rows;

describe("concurrency gate (SPEC 9.4): run 10 times in a row", () => {
  it.each(Array.from({ length: 10 }, (_, run) => run + 1))("run %i: 20 simultaneous holds on one slot give exactly one success and 19 SLOT_TAKEN", async () => {
    const vendor = await bookableVendor();
    const users = await Promise.all(Array.from({ length: 20 }, client));
    const results = await Promise.allSettled(users.map(user => hold(holdInput(vendor, user))));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.map(codeOf).filter(code => code === "SLOT_TAKEN")).toHaveLength(19);
    const active = await pool.query("SELECT count(*)::int AS n FROM bookings WHERE vendor_id=$1 AND status IN ('HELD','PENDING','CONFIRMED')", [vendor.vendorId]);
    expect(active.rows[0].n).toBe(1);
  });

  it.each(Array.from({ length: 10 }, (_, run) => run + 1))("run %i: vendor time off versus customer holds has exactly one winner", async () => {
    const vendor = await bookableVendor();
    const cookie = `bayana_session=${await transaction(db => startSession(db, vendor.ownerId))}`;
    const users = await Promise.all(Array.from({ length: 5 }, client));
    const block = fetch(`${base}/v1/vendor/availability/blocked-periods`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify({ starts_at: nineIst, ends_at: tenIst, reason: "Dentist" }) })
      .then(async response => { if (response.status !== 201) throw Object.assign(new Error("block refused"), { code: (await response.json()).error.code }); return response; });
    const results = await Promise.allSettled([block, ...users.map(user => hold(holdInput(vendor, user)))]);
    const winners = results.filter(result => result.status === "fulfilled");
    expect(winners).toHaveLength(1);
    // The losers fail with the right reason: holds see SLOT_TAKEN, the block sees BOOKING_CONFLICT.
    for (const [index, result] of results.entries()) if (result.status === "rejected") expect(codeOf(result)).toBe(index === 0 ? "BOOKING_CONFLICT" : "SLOT_TAKEN");
  });
});

describe("hold creation", () => {
  it("computes times, price and advance on the server and snapshots the service", async () => {
    const vendor = await bookableVendor(); const user = await client();
    const booking = await hold(holdInput(vendor, user));
    const row = (await pool.query("SELECT * FROM bookings WHERE id=$1", [booking.id])).rows[0];
    expect(row).toMatchObject({ status: "HELD", total_paise: "100000", advance_paise: "20000", service_name: "Session", duration_minutes: 60, service_advance_type: "PERCENT", service_advance_value: 20 });
    expect(new Date(row.starts_at).toISOString()).toBe(nineIst);
    expect(new Date(row.ends_at).toISOString()).toBe(tenIst);
    expect(row.block_start).toEqual(row.starts_at);
    await pool.query("UPDATE services SET name='Renamed', price_paise=999999 WHERE id=$1", [vendor.serviceId]);
    expect((await pool.query("SELECT service_name,total_paise FROM bookings WHERE id=$1", [booking.id])).rows[0]).toEqual({ service_name: "Session", total_paise: "100000" });
    // The response never carries secrets or hashes.
    expect(Object.keys(booking)).not.toContain("access_token_hash");
    expect(Object.keys(booking)).not.toContain("idempotency_fingerprint");
  });

  it("records (none) -> HELD -> PENDING events; a zero advance goes on to CONFIRMED", async () => {
    const paid = await accepted(holdInput(await bookableVendor(), await client()));
    expect(await events(paid.id)).toEqual([{ from_status: null, to_status: "HELD", actor: "client" }, { from_status: "HELD", to_status: "PENDING", actor: "client" }]);
    const free = await accepted(holdInput(await bookableVendor({ type: "NONE", value: 0 }), await client()));
    expect(free.status).toBe("CONFIRMED");
    expect((await events(free.id)).map(event => event.to_status)).toEqual(["HELD", "PENDING", "CONFIRMED"]);
  });

  it("rejects a start time the engine does not offer", async () => {
    const vendor = await bookableVendor();
    await expect(hold(holdInput(vendor, await client(), { startsAt: `${day}T03:31:00.000Z` }))).rejects.toMatchObject({ code: "SLOT_TAKEN", status: 409 });
    await expect(hold(holdInput(vendor, await client(), { startsAt: `${day}T13:00:00.000Z` }))).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("maps an exclusion-constraint violation (23P01) to SLOT_TAKEN when the engine cannot see the conflict", async () => {
    // A paid but overdue PENDING booking: the engine treats it as free (hold over), expiry leaves it alone (payment exists),
    // so only the constraint catches the overlap.
    const vendor = await bookableVendor();
    const first = await hold(holdInput(vendor, await client()));
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [first.id]);
    await pool.query("INSERT INTO payments(id,booking_id,provider_order_id,status,amount_paise) VALUES($1,$2,$3,'CAPTURED',20000)", [randomUUID(), first.id, `order_${randomUUID()}`]);
    await expect(hold(holdInput(vendor, await client()))).rejects.toMatchObject({ code: "SLOT_TAKEN", status: 409 });
  });

  it("expires the vendor's overdue holds first (through transitionBooking), then reuses the slot", async () => {
    const vendor = await bookableVendor();
    const first = await hold(holdInput(vendor, await client()));
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [first.id]);
    const second = await hold(holdInput(vendor, await client()));
    expect(second.status).toBe("HELD");
    expect((await pool.query("SELECT status FROM bookings WHERE id=$1", [first.id])).rows[0].status).toBe("EXPIRED");
    expect((await events(first.id)).at(-1)).toEqual({ from_status: "HELD", to_status: "EXPIRED", actor: "system" });
  });
});

describe("idempotency (BK-05)", () => {
  it("the same key and body returns the same booking; a different body is refused; keys are scoped per vendor", async () => {
    const vendor = await bookableVendor(); const user = await client(); const key = randomUUID();
    const first = await hold(holdInput(vendor, user, { key }));
    const again = await hold(holdInput(vendor, user, { key }));
    expect(again.id).toBe(first.id);
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE vendor_id=$1", [vendor.vendorId])).rows[0].n).toBe(1);
    await expect(hold(holdInput(vendor, user, { key, startsAt: tenIst }))).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
    const other = await bookableVendor();
    expect((await hold(holdInput(other, user, { key }))).id).not.toBe(first.id);
  });
  it("20 simultaneous requests with one key create one booking", async () => {
    const vendor = await bookableVendor(); const user = await client(); const key = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => hold(holdInput(vendor, user, { key }))));
    const ids = new Set(results.map(result => result.status === "fulfilled" ? (result.value as { id: string }).id : codeOf(result)));
    expect([...ids]).toHaveLength(1);
  });
});

describe("transitionBooking (SPEC 10)", () => {
  it("enforces the state table and its guards", async () => {
    const booking = await accepted(holdInput(await bookableVendor(), await client()));
    await expect(transaction(db => transitionBooking(db, booking.id, "COMPLETED", "vendor", "done"))).rejects.toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    await expect(transaction(db => transitionBooking(db, booking.id, "CONFIRMED", "vendor", "no proof"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transaction(db => transitionBooking(db, booking.id, "EXPIRED", "system", "early"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const confirmed = await transaction(db => transitionBooking(db, booking.id, "CONFIRMED", "vendor", "offline advance recorded", { offline_advance: true }));
    expect(confirmed.status).toBe("CONFIRMED");
    // CONFIRMED -> COMPLETED only after the booking has ended.
    await expect(transaction(db => transitionBooking(db, booking.id, "COMPLETED", "vendor", "done"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transaction(db => transitionBooking(db, booking.id, "HELD", "vendor", "back"))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transaction(db => transitionBooking(db, randomUUID(), "CANCELLED", "vendor", "x"))).rejects.toMatchObject({ status: 404 });
    expect((await events(booking.id)).map(event => event.to_status)).toEqual(["HELD", "PENDING", "CONFIRMED"]);
  });
  it("locks the row: two simultaneous cancellations give one success", async () => {
    const booking = await accepted(holdInput(await bookableVendor(), await client()));
    const results = await Promise.allSettled([1, 2].map(n => transaction(db => transitionBooking(db, booking.id, "CANCELLED", n === 1 ? "vendor" : "client", "changed plans"))));
    expect(results.map(codeOf).sort()).toEqual(["INVALID_TRANSITION", "OK"]);
    expect((await events(booking.id)).filter(event => event.to_status === "CANCELLED")).toHaveLength(1);
  });
  it("the sweep expires every vendor's overdue holds and is safe to run twice", async () => {
    const booking = await hold(holdInput(await bookableVendor(), await client()));
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [booking.id]);
    expect(await transaction(db => expireOverdueHolds(db, null))).toBeGreaterThanOrEqual(1);
    expect(await transaction(db => expireOverdueHolds(db, null))).toBe(0);
    expect((await pool.query("SELECT status FROM bookings WHERE id=$1", [booking.id])).rows[0].status).toBe("EXPIRED");
  });
});

describe("time off goes through transitionBooking", () => {
  it("expires the vendor's overdue hold with an event before checking for conflicts", async () => {
    const vendor = await bookableVendor();
    const booking = await hold(holdInput(vendor, await client()));
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [booking.id]);
    const cookie = `bayana_session=${await transaction(db => startSession(db, vendor.ownerId))}`;
    const response = await fetch(`${base}/v1/vendor/availability/blocked-periods`, { method: "POST", headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.78.0.1" }, body: JSON.stringify({ starts_at: nineIst, ends_at: tenIst, reason: "Travel" }) });
    expect(response.status).toBe(201);
    expect((await events(booking.id)).at(-1)).toEqual({ from_status: "HELD", to_status: "EXPIRED", actor: "system" });
  });
});

describe("booking_events is append-only", () => {
  it("UPDATE, DELETE and TRUNCATE are rejected even for the migration owner", async () => {
    const booking = await accepted(holdInput(await bookableVendor(), await client()));
    await expect(pool.query("UPDATE booking_events SET reason='rewritten' WHERE booking_id=$1", [booking.id])).rejects.toMatchObject({ code: "42501" });
    await expect(pool.query("DELETE FROM booking_events WHERE booking_id=$1", [booking.id])).rejects.toMatchObject({ code: "42501" });
    await expect(pool.query("TRUNCATE booking_events CASCADE")).rejects.toMatchObject({ code: "42501" });
    expect(await events(booking.id)).toHaveLength(2);
  });
  it("the bayana_app role may insert and read events but not update, delete or truncate them", async () => {
    const privileges = await pool.query("SELECT has_table_privilege('bayana_app','booking_events','INSERT') AS ins, has_table_privilege('bayana_app','booking_events','SELECT') AS sel, has_table_privilege('bayana_app','booking_events','UPDATE') AS upd, has_table_privilege('bayana_app','booking_events','DELETE') AS del, has_table_privilege('bayana_app','booking_events','TRUNCATE') AS trn, has_table_privilege('bayana_app','bookings','UPDATE') AS bookings_upd");
    expect(privileges.rows[0]).toEqual({ ins: true, sel: true, upd: false, del: false, trn: false, bookings_upd: true });
  });
});

describe("customer booking link (BK-08)", () => {
  it("GET /v1/bookings/:id returns balance_due_paise to the owner and 404 to strangers", async () => {
    const vendor = await bookableVendor(); const user = await client();
    const booking = await accepted(holdInput(vendor, user));
    const own = `bayana_session=${await transaction(db => startSession(db, user.id))}`;
    const mine = await fetch(`${base}/v1/bookings/${booking.id}`, { headers: { cookie: own } });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ status: "PENDING", balance_due_paise: 100000, starts_at: expect.any(String) });
    expect((await fetch(`${base}/v1/bookings/${booking.id}?t=wrong-token`)).status).toBe(404);
  });
});
