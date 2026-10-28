import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { addLocalDays, localDateOf, localDateTimeToUtc, sessionTotalPaise } from "@bayana/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { hourlyRange, slotsForDate, type SlotEngineInput } from "../../src/availability.js";
import { createHold } from "../../src/booking-service.js";
import { config } from "../../src/config.js";
import { loadContract } from "../../src/contract.js";
import { assertTestDatabase, pool, transaction } from "../../src/database.js";
import { sendOutbox } from "../../src/notifications/outbox.js";
import { bookingLine } from "../../src/payments/receipt.js";
import { createUser } from "../helpers.js";

// Multi-session bookings (SPEC 4.3 "Sessions"): one hourly booking is 1 to 12 consecutive sessions of the service's duration on
// one local day, priced per session, buffers once around the whole range, guarded by the same exclusion constraint.
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
// createHold queues an urgent "hold started" email per hold; send them all (to the in-memory capture) so no backlog is left.
afterAll(async () => { while ((await sendOutbox({ limit: 200 })).sent > 0); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; body: Record<string, any>; text: string; headers: Headers };
async function call(method: string, path: string, options: { cookie?: string; body?: unknown; key?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.89.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.key ? { "idempotency-key": options.key } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, text, headers: response.headers };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;

type VendorOptions = { timezone?: string; duration?: number; min?: number; max?: number; before?: number; after?: number; price?: number; advance?: { type: "PERCENT" | "FIXED" | "NONE"; value: number }; windows?: [string, string][]; published?: boolean; notice?: number; window?: number };
/** A published vendor open every weekday (09:00-13:00 and 14:00-18:00 by default: a lunch break) with one hourly service. */
async function vendor(options: VendorOptions = {}) {
  const owner = await createUser(pool); const vendorId = randomUUID(), serviceId = randomUUID(), dailyId = randomUUID(), slug = `blocks-${randomUUID().slice(0, 8)}`, timezone = options.timezone ?? "Asia/Kolkata";
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Blocks test','Pune','',100000,'PERCENT',20,$4,true,$5,$6,$7,'The advance confirms the time.',false)", [vendorId, owner.id, slug, options.published ?? true, timezone, options.notice ?? 0, options.window ?? 365]);
  const advance = options.advance ?? { type: "PERCENT", value: 30 };
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_blocks,max_blocks,advance_type,advance_value) VALUES($1,$2,'Studio time',$3,$4,$5,$6,'hourly',$7,$8,$9,$10)",
    [serviceId, vendorId, options.price ?? 150_000, options.duration ?? 60, options.before ?? 0, options.after ?? 0, options.min ?? 1, options.max ?? 4, advance.type, advance.value]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,buffer_days,advance_type,advance_value) VALUES($1,$2,'Event day',900000,NULL,NULL,NULL,'daily',1,2,0,'NONE',0)", [dailyId, vendorId]);
  for (let weekday = 0; weekday < 7; weekday++) for (const [start, end] of options.windows ?? [["09:00", "13:00"], ["14:00", "18:00"]]) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)", [randomUUID(), vendorId, weekday, start, end]);
  return { vendorId, serviceId, dailyId, slug, timezone, ownerId: owner.id };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
const customer = () => createUser(pool, { role: "CLIENT" });
const ahead = (days: number, timezone = "Asia/Kolkata") => addLocalDays(localDateOf(new Date(), timezone), days);
/** The UTC instant (ISO, as the slots endpoint gives it) of a local wall-clock time. */
const at = (date: string, time: string, timezone = "Asia/Kolkata") => localDateTimeToUtc(`${date}T${time}:00`, timezone)!.toISOString();
const hold = async (v: Vendor, date: string, time: string, blocks?: number, extra: Partial<Parameters<typeof createHold>[1]> = {}) => {
  const user = await customer();
  return transaction(db => createHold(db, { slug: v.slug, date, name: "Ravi Iyer", email: user.email, clientUserId: user.id, serviceId: v.serviceId, startsAt: at(date, time, v.timezone), ...(blocks === undefined ? {} : { blocks }), key: randomUUID(), ...extra }));
};
const codeOf = async (promise: Promise<unknown>) => { try { await promise; return "OK"; } catch (error) { return (error as { code?: string }).code; } };
const row = async (id: string) => (await pool.query("SELECT booking_mode,blocks_count,block_minutes,duration_minutes,starts_at,ends_at,block_start,block_end,total_paise::int AS total,advance_paise::int AS advance,service_price_paise::int AS per_session,buffer_before_minutes,buffer_after_minutes FROM bookings WHERE id=$1", [id])).rows[0];
const slots = async (v: Vendor, date: string) => call("GET", `/v1/vendors/${v.slug}/availability/slots?service_id=${v.serviceId}&date=${date}`);
/** Local start time -> most consecutive sessions free from it, for every bookable start on a date. */
const maxBlocksByTime = async (v: Vendor, date: string) => Object.fromEntries((await slots(v, date)).body.slots.map((slot: { startsAt: string; maxBlocks: number }) => [new Intl.DateTimeFormat("en-GB", { timeZone: v.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt)), slot.maxBlocks]));
const iso = (value: Date) => value.toISOString();
const plusMinutes = (value: string, minutes: number) => new Date(new Date(value).getTime() + minutes * 60_000).toISOString();

describe("migration 022", () => {
  it("adds the constraints, validated, and leaves every service and booking with one session unless set otherwise", async () => {
    const constraints = (await pool.query("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('services_blocks','bookings_blocks','bookings_no_overlap') ORDER BY conname")).rows;
    expect(constraints).toEqual([{ conname: "bookings_blocks", convalidated: true }, { conname: "bookings_no_overlap", convalidated: true }, { conname: "services_blocks", convalidated: true }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM services WHERE booking_mode='hourly' AND (min_blocks IS NULL OR max_blocks IS NULL)")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM services WHERE booking_mode='daily' AND (min_blocks IS NOT NULL OR max_blocks IS NOT NULL)")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE booking_mode='hourly' AND (blocks_count IS NULL OR block_minutes IS NULL)")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE booking_mode='daily' AND (blocks_count IS NOT NULL OR block_minutes IS NOT NULL)")).rows[0].n).toBe(0);
  });
  it("replayed on pre-022 rows, it backfills one session and changes no price or time (rolled back afterwards)", async () => {
    assertTestDatabase(config.DATABASE_URL);
    const client = new Client({ connectionString: config.DATABASE_URL }); await client.connect();
    try {
      await client.query("BEGIN");
      // A private schema shaped like the pre-022 tables, first on the search path, so the migration's unqualified names land there.
      await client.query("CREATE SCHEMA mb_replay"); await client.query("SET LOCAL search_path TO mb_replay, public");
      await client.query("CREATE TABLE services(id int PRIMARY KEY, booking_mode text NOT NULL, duration_minutes integer, price_paise bigint NOT NULL)");
      await client.query("CREATE TABLE bookings(id int PRIMARY KEY, booking_mode text NOT NULL DEFAULT 'hourly', duration_minutes integer, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, block_start timestamptz NOT NULL, block_end timestamptz NOT NULL, total_paise bigint NOT NULL, advance_paise bigint NOT NULL)");
      await client.query("INSERT INTO services VALUES (1,'hourly',90,800000),(2,'daily',NULL,3500000),(3,'hourly',1440,100)");
      await client.query(`INSERT INTO bookings VALUES
        (1,'hourly',90,'2026-11-12T08:30:00Z','2026-11-12T10:00:00Z','2026-11-12T08:15:00Z','2026-11-12T10:15:00Z',800000,200000),
        (2,'hourly',NULL,'2026-11-13T08:30:00Z','2026-11-13T09:15:00Z','2026-11-13T08:30:00Z','2026-11-13T09:15:00Z',50000,0),
        (3,'daily',NULL,'2026-11-13T18:30:00Z','2026-11-15T18:30:00Z','2026-11-13T18:30:00Z','2026-11-15T18:30:00Z',7000000,1000000)`);
      const before = (await client.query("SELECT id,starts_at,ends_at,block_start,block_end,total_paise,advance_paise FROM bookings ORDER BY id")).rows;
      const servicePrices = (await client.query("SELECT id,price_paise,duration_minutes FROM services ORDER BY id")).rows;
      await client.query(readFileSync(new URL("../../sql/022_multi_block.sql", import.meta.url), "utf8"));
      expect((await client.query("SELECT id,starts_at,ends_at,block_start,block_end,total_paise,advance_paise FROM bookings ORDER BY id")).rows).toEqual(before);
      expect((await client.query("SELECT id,price_paise,duration_minutes FROM services ORDER BY id")).rows).toEqual(servicePrices);
      expect((await client.query("SELECT id,min_blocks,max_blocks FROM services ORDER BY id")).rows).toEqual([{ id: 1, min_blocks: 1, max_blocks: 1 }, { id: 2, min_blocks: null, max_blocks: null }, { id: 3, min_blocks: 1, max_blocks: 1 }]);
      expect((await client.query("SELECT id,blocks_count,block_minutes FROM bookings ORDER BY id")).rows).toEqual([{ id: 1, blocks_count: 1, block_minutes: 90 }, { id: 2, blocks_count: 1, block_minutes: 45 }, { id: 3, blocks_count: null, block_minutes: null }]);
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
  it("inserts that name no sessions get one session; the database refuses impossible session settings", async () => {
    const v = await vendor(); const id = randomUUID();
    await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,advance_type,advance_value) VALUES($1,$2,'Old style',50000,30,'NONE',0)", [id, v.vendorId]);
    expect((await pool.query("SELECT min_blocks,max_blocks FROM services WHERE id=$1", [id])).rows[0]).toEqual({ min_blocks: 1, max_blocks: 1 });
    const refused = (minBlocks: number | null, maxBlocks: number | null, duration: number | null = 60, mode = "hourly") => pool.query(
      "INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,buffer_days,min_blocks,max_blocks,advance_type,advance_value) VALUES($1,$2,'Bad',50000,$3,$4,$4,$5,$6,$6,$7,$8,$9,'NONE',0)",
      [randomUUID(), v.vendorId, duration, mode === "hourly" ? 0 : null, mode, mode === "daily" ? 1 : null, mode === "daily" ? 0 : null, minBlocks, maxBlocks]);
    const attempts: [number, number, number | null, string?][] = [[0, 1, 60], [3, 2, 60], [1, 13, 60], [1, 3, 600], [1, 2, null, "daily"]];
    for (const [minBlocks, maxBlocks, duration, mode] of attempts) await expect(refused(minBlocks, maxBlocks, duration, mode)).rejects.toMatchObject({ code: "23514", constraint: "services_blocks" });
  });
});

describe("service validation (shared schema, API)", () => {
  const hourly = { name: "Studio time", price_paise: 150_000, advance_type: "PERCENT", advance_value: 30, booking_mode: "hourly", duration_minutes: 60 };
  it("an hourly service stores its session limits; without them it is one session, as before", async () => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId);
    const created = await call("POST", "/v1/vendor/services", { cookie, body: { ...hourly, min_blocks: 1, max_blocks: 4 } });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ booking_mode: "hourly", duration_minutes: 60, min_blocks: 1, max_blocks: 4, min_days: null });
    const plain = await call("POST", "/v1/vendor/services", { cookie, body: hourly });
    expect(plain.body).toMatchObject({ min_blocks: 1, max_blocks: 1 });
    // Switching to per day drops the session limits.
    const switched = await call("PATCH", `/v1/vendor/services/${created.body.id}`, { cookie, body: { booking_mode: "daily", min_days: 1, max_days: 2 } });
    expect(switched.status).toBe(200); expect(switched.body).toMatchObject({ booking_mode: "daily", min_blocks: null, max_blocks: null, duration_minutes: null });
  });
  it.each([
    ["min above max", { ...hourly, min_blocks: 3, max_blocks: 2 }, "The maximum must be at least the minimum number of sessions."],
    ["more than 12 sessions", { ...hourly, max_blocks: 13 }, "At most 12 sessions."],
    ["zero sessions", { ...hourly, min_blocks: 0 }, "At least 1 session."],
    ["a missing session length", { ...hourly, duration_minutes: undefined, max_blocks: 3 }, "Enter how long the service takes, in minutes."],
    ["a longest booking over a day", { ...hourly, duration_minutes: 180, max_blocks: 9 }, "9 sessions of 180 minutes is more than a day."],
    ["sessions on a daily service", { name: "Event", price_paise: 900_000, advance_type: "NONE", advance_value: 0, booking_mode: "daily", min_days: 1, max_days: 2, max_blocks: 3 }, "Per-day services do not use sessions."]
  ])("refuses %s with a plain message", async (_case, body, message) => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId);
    const reply = await call("POST", "/v1/vendor/services", { cookie, body });
    expect(reply.status).toBe(400); expect(reply.text).toContain(message);
  });
});

describe("ranges of consecutive sessions", () => {
  it("a 3-session booking occupies exactly start to start + 3 sessions, priced per session", async () => {
    const v = await vendor(); const date = ahead(10);
    const booking = await hold(v, date, "10:00", 3);
    expect(await row(booking.id)).toMatchObject({ booking_mode: "hourly", blocks_count: 3, block_minutes: 60, duration_minutes: 180, total: 450_000, advance: 135_000, per_session: 150_000 });
    const stored = await row(booking.id);
    expect(iso(stored.starts_at)).toBe(at(date, "10:00")); expect(iso(stored.ends_at)).toBe(at(date, "13:00"));
    expect(iso(stored.block_start)).toBe(at(date, "10:00")); expect(iso(stored.block_end)).toBe(at(date, "13:00"));
  });
  it("one session without `blocks` is today's booking, byte for byte in price and time", async () => {
    const v = await vendor(); const date = ahead(11);
    const booking = await hold(v, date, "10:00");
    expect(await row(booking.id)).toMatchObject({ blocks_count: 1, block_minutes: 60, duration_minutes: 60, total: 150_000, advance: 45_000 });
    expect(iso((await row(booking.id)).ends_at)).toBe(at(date, "11:00"));
  });
  it("adjacent bookings are allowed; any overlap is refused by the database constraint itself", async () => {
    const v = await vendor(); const date = ahead(12);
    await hold(v, date, "09:00", 3);
    expect(await codeOf(hold(v, date, "12:00", 1))).toBe("OK");
    // Straight into the table, bypassing every app check: the exclusion constraint refuses 11:30-12:30 over 09:00-12:00.
    await expect(pool.query("INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,idempotency_key,starts_at,ends_at,block_start,block_end) VALUES($1,$2,$3,'Raw','raw@example.test','','CONFIRMED',1,0,$4,$5,$6,$5,$6)",
      [randomUUID(), v.vendorId, date, randomUUID(), at(date, "11:30"), at(date, "12:30")])).rejects.toMatchObject({ code: "23P01" });
  });
  it.each([
    ["crosses closing time", "17:00", 2, async () => undefined],
    ["crosses the lunch break", "12:00", 2, async () => undefined],
    ["runs into time off", "10:00", 2, async (v: Vendor, date: string) => { await pool.query("INSERT INTO blocked_periods(id,vendor_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,'Dentist')", [randomUUID(), v.vendorId, at(date, "11:00"), at(date, "11:30")]); }],
    ["is on a blocked date", "10:00", 2, async (v: Vendor, date: string) => { await pool.query("INSERT INTO availability_overrides(id,vendor_id,local_date,kind) VALUES($1,$2,$3,'block')", [randomUUID(), v.vendorId, date]); }],
    ["has another booking in the middle", "10:00", 3, async (v: Vendor, date: string) => { await hold(v, date, "11:00", 1); }],
    ["has a blocked hour in the middle", "09:00", 3, async (v: Vendor, date: string) => { await pool.query("INSERT INTO availability_overrides(id,vendor_id,local_date,kind,start_time,end_time) VALUES($1,$2,$3,'block','10:00','10:30')", [randomUUID(), v.vendorId, date]); }]
  ])("refuses a range that %s, with a plain message", async (_case, time, blocks, setup) => {
    const v = await vendor(); const date = ahead(14);
    await setup(v, date);
    const user = await customer(); const cookie = await sessionFor(user.id);
    const reply = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.serviceId, starts_at: at(date, time), blocks, name: "Ravi Iyer" } });
    expect(reply.status).toBe(409); expect(reply.body.error.code).toBe("SLOT_TAKEN");
    expect(reply.body.error.message).toMatch(/sessions in a row are not free from that time|That time was just taken/);
  });
  it("refuses a range that would run past local midnight, even when the next day opens at midnight", async () => {
    const v = await vendor({ duration: 120, max: 3, windows: [["00:00", "24:00"]] }); const date = ahead(15);
    expect(await codeOf(hold(v, date, "22:00", 1))).toBe("OK");
    const later = await vendor({ duration: 120, max: 3, windows: [["00:00", "24:00"]] });
    expect(await codeOf(hold(later, date, "22:00", 2))).toBe("SLOT_TAKEN");
    expect((await maxBlocksByTime(later, date))["22:00"]).toBe(1);
  });
  it("refuses a start inside the minimum notice and a date beyond the booking window", async () => {
    const v = await vendor({ notice: 3 * 24 * 60, window: 30 });
    expect(await codeOf(hold(v, ahead(1), "10:00", 2))).toBe("SLOT_TAKEN");
    expect(await codeOf(hold(v, ahead(31), "10:00", 2))).toBe("SLOT_TAKEN");
    expect(await codeOf(hold(v, ahead(10), "10:00", 2))).toBe("OK");
  });
});

describe("most consecutive sessions from each start (slots endpoint)", () => {
  it("counts up to the service maximum, down to 1 before the break and closing, and stops right before another booking", async () => {
    const v = await vendor(); const date = ahead(20);
    expect(await maxBlocksByTime(v, date)).toEqual({ "09:00": 4, "09:30": 3, "10:00": 3, "10:30": 2, "11:00": 2, "11:30": 1, "12:00": 1, "14:00": 4, "14:30": 3, "15:00": 3, "15:30": 2, "16:00": 2, "16:30": 1, "17:00": 1 });
    await hold(v, date, "16:00", 1);
    const after = await maxBlocksByTime(v, date);
    expect(after).toMatchObject({ "14:00": 2, "14:30": 1, "15:00": 1, "17:00": 1 });
    expect(after["15:30"]).toBeUndefined(); expect(after["16:00"]).toBeUndefined(); expect(after["16:30"]).toBeUndefined();
  });
  it("starts with fewer than the minimum sessions free are not offered; the response says the limits and is never cached", async () => {
    const v = await vendor({ min: 2, max: 3 }); const date = ahead(21);
    const reply = await slots(v, date);
    expect(reply.headers.get("cache-control")).toBe("no-store");
    expect(reply.body).toMatchObject({ timezone: "Asia/Kolkata", min_blocks: 2, max_blocks: 3 });
    const map = await maxBlocksByTime(v, date);
    expect(map["11:00"]).toBe(2); expect(map["11:30"]).toBeUndefined(); expect(map["09:00"]).toBe(3);
    // The shortest booking from a start is what endsAt describes: min_blocks sessions.
    const first = reply.body.slots[0]; expect(first.endsAt).toBe(plusMinutes(first.startsAt, 120));
    expect(await codeOf(hold(v, date, "09:00", 1))).toBe("INVALID_BLOCKS");
  });
  it("unpublished and unknown vendors get the same 404", async () => {
    const hidden = await vendor({ published: false });
    const unpublished = await call("GET", `/v1/vendors/${hidden.slug}/availability/slots?service_id=${hidden.serviceId}&date=${ahead(10)}`);
    const unknown = await call("GET", `/v1/vendors/no-such-${randomUUID().slice(0, 8)}/availability/slots?service_id=${hidden.serviceId}&date=${ahead(10)}`);
    expect(unpublished.status).toBe(404); expect(unknown.status).toBe(404); expect(unpublished.body).toEqual(unknown.body);
  });
});

describe("buffers and timezones", () => {
  it("applies the buffers once around the whole range, not per session", async () => {
    const v = await vendor({ before: 15, after: 30, windows: [["09:00", "18:00"]] }); const date = ahead(22);
    const booking = await hold(v, date, "10:00", 3);
    const stored = await row(booking.id);
    expect(iso(stored.block_start)).toBe(at(date, "09:45")); expect(iso(stored.block_end)).toBe(at(date, "13:30"));
    expect(stored).toMatchObject({ buffer_before_minutes: 15, buffer_after_minutes: 30 });
    // The next start needs its own 15 minutes before: 13:30 plus 15 is 13:45, so the first free start on the 30-minute grid is 14:00.
    const map = await maxBlocksByTime(v, date);
    expect(map["13:30"]).toBeUndefined(); expect(map["14:00"]).toBe(4);
  });
  it("a non-IST vendor gets correct UTC times, including across both daylight-saving changes", async () => {
    const zone = "America/New_York";
    const ny = await vendor({ timezone: zone, windows: [["00:00", "12:00"]] });
    const plain = await hold(ny, "2026-11-10", "09:00", 2);
    expect(iso((await row(plain.id)).starts_at)).toBe("2026-11-10T14:00:00.000Z"); expect(iso((await row(plain.id)).ends_at)).toBe("2026-11-10T16:00:00.000Z");
    // 1 November 2026 falls back at 02:00: three real hours from 00:00 EDT end at 02:00 EST (07:00Z), not at 03:00 local.
    const fallBack = await hold(ny, "2026-11-01", "00:00", 3);
    expect(iso((await row(fallBack.id)).starts_at)).toBe("2026-11-01T04:00:00.000Z"); expect(iso((await row(fallBack.id)).ends_at)).toBe("2026-11-01T07:00:00.000Z");
    // 14 March 2027 springs forward at 02:00: three real hours from 00:00 EST end at 04:00 EDT (08:00Z).
    const springForward = await hold(ny, "2027-03-14", "00:00", 3);
    expect(iso((await row(springForward.id)).starts_at)).toBe("2027-03-14T05:00:00.000Z"); expect(iso((await row(springForward.id)).ends_at)).toBe("2027-03-14T08:00:00.000Z");
  });
  it("on a spring-forward day the real end must still be inside opening hours (pure engine)", () => {
    const input: SlotEngineInput = { timezone: "America/New_York", serviceDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, bookingMode: "hourly", slotStepMinutes: 30, blocks: { minBlocks: 1, maxBlocks: 4 },
      minimumNoticeMinutes: 0, maximumDaysAhead: 365, weeklyRules: new Map([[0, [{ startTime: "00:00", endTime: "05:00" }]]]), overrides: [], blockedPeriods: [], activeBookings: [], now: new Date("2027-03-01T12:00:00Z") };
    // Open 00:00-05:00 local. From 01:00 EST, four real hours end at 06:00 EDT: past closing, so at most three fit.
    expect(slotsForDate("2027-03-14", input).find(slot => slot.startsAt === "2027-03-14T06:00:00.000Z")?.maxBlocks).toBe(3);
    expect(hourlyRange("2027-03-14", "2027-03-14T06:00:00.000Z", 4, input)).toBeNull();
    expect(hourlyRange("2027-03-14", "2027-03-14T06:00:00.000Z", 3, input)?.endsAt).toBe("2027-03-14T09:00:00.000Z");
  });
});

describe("holds, concurrency and idempotency", () => {
  it("two parallel holds on overlapping ranges: exactly one succeeds, every time", async () => {
    for (let round = 0; round < 4; round++) {
      const v = await vendor(); const date = ahead(30 + round);
      const results = await Promise.all([codeOf(hold(v, date, "09:00", 3)), codeOf(hold(v, date, "11:00", 2))]);
      expect(results.sort()).toEqual(["OK", "SLOT_TAKEN"]);
      expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE vendor_id=$1 AND status='HELD'", [v.vendorId])).rows[0].n).toBe(1);
    }
  });
  it("an expired hold frees its whole range", async () => {
    const v = await vendor(); const date = ahead(36);
    const first = await hold(v, date, "09:00", 4);
    expect((await maxBlocksByTime(v, date))["09:00"]).toBeUndefined();
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [first.id]);
    expect((await maxBlocksByTime(v, date))["09:00"]).toBe(4);
    expect(await codeOf(hold(v, date, "11:00", 2))).toBe("OK");
  });
  it("retrying with the same idempotency key returns the same booking; a different length with that key is refused", async () => {
    const v = await vendor(); const date = ahead(37); const user = await customer(); const key = randomUUID();
    const input = { slug: v.slug, date, name: "Ravi Iyer", email: user.email, clientUserId: user.id, serviceId: v.serviceId, startsAt: at(date, "10:00"), blocks: 2, key };
    const first = await transaction(db => createHold(db, input)); const again = await transaction(db => createHold(db, input));
    expect(again.id).toBe(first.id);
    expect(await codeOf(transaction(db => createHold(db, { ...input, blocks: 3 })))).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("money and what the client may not decide", () => {
  it("total is sessions x price in integer paise and the advance never exceeds it", async () => {
    const v = await vendor({ price: 99_999, advance: { type: "PERCENT", value: 33 } });
    for (const blocks of [1, 2, 3, 4]) {
      const booking = await hold(v, ahead(40 + blocks), "09:00", blocks);
      const stored = await row(booking.id);
      expect(stored.total).toBe(sessionTotalPaise(99_999, blocks)); expect(Number.isInteger(stored.advance)).toBe(true);
      expect(stored.advance).toBe(Math.floor((99_999 * blocks * 33 + 50) / 100)); expect(stored.advance).toBeLessThanOrEqual(stored.total);
    }
    const fixed = await vendor({ price: 150_000, advance: { type: "FIXED", value: 150_000 } });
    const booking = await hold(fixed, ahead(46), "09:00", 3);
    expect(await row(booking.id)).toMatchObject({ total: 450_000, advance: 150_000 });
  });
  it("refuses more sessions than the maximum, and ignores any end time, duration or price the client sends", async () => {
    const v = await vendor(); const date = ahead(47); const user = await customer(); const cookie = await sessionFor(user.id);
    const send = (body: Record<string, unknown>) => call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.serviceId, starts_at: at(date, "09:00"), name: "Ravi Iyer", ...body } });
    const tooMany = await send({ blocks: 5 });
    expect(tooMany.status).toBe(400); expect(tooMany.body.error).toMatchObject({ code: "INVALID_BLOCKS", message: "Choose between 1 and 4 sessions." });
    expect((await send({ blocks: 13 })).status).toBe(400); expect((await send({ blocks: 0 })).status).toBe(400); expect((await send({ blocks: 1.5 })).status).toBe(400);
    const sneaky = await send({ blocks: 2, ends_at: at(date, "18:00"), duration_minutes: 600, total_paise: 1, price_paise: 1, advance_paise: 0 });
    expect(sneaky.status).toBe(201);
    const stored = await row(sneaky.body.booking.id);
    expect(iso(stored.ends_at)).toBe(at(date, "11:00")); expect(stored).toMatchObject({ blocks_count: 2, duration_minutes: 120, total: 300_000, advance: 90_000 });
  });
  it("a daily service refuses a number of sessions", async () => {
    const v = await vendor(); const user = await customer();
    expect(await codeOf(transaction(db => createHold(db, { slug: v.slug, date: ahead(48), name: "Ravi Iyer", email: user.email, clientUserId: user.id, serviceId: v.dailyId, days: 1, blocks: 2, key: randomUUID() })))).toBe("DAILY_SERVICE");
  });
});

describe("every place shows the whole range", () => {
  it("contract, hold email, booking view and receipt line show start to end and the length; one session reads as before", async () => {
    const v = await vendor(); const date = ahead(50);
    const booking = await hold(v, date, "10:00", 3);
    const contract = (await loadContract(pool, booking.id))!.text;
    expect(contract).toMatch(/Date and time: .*, 10:00 am to 1:00 pm, 3 hours \(Asia\/Kolkata\)/);
    expect(contract).toContain("Price per session: ₹1,500.00 x 3 sessions of 1 hour");
    expect(contract).toContain("Total price: ₹4,500.00");
    const mail = (await pool.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE booking_id=$1 AND template='hold_started'", [booking.id])).rows[0];
    expect(mail.text_body).toMatch(/10:00 am to 1:00 pm, 3 hours \(Asia\/Kolkata\)/);
    const single = await hold(v, ahead(51), "10:00");
    const singleContract = (await loadContract(pool, single.id))!.text;
    expect(singleContract).toMatch(/Date and time: .*, 10:00 am \(Asia\/Kolkata\)/); expect(singleContract).not.toContain("Price per session");
    const stored = await row(booking.id);
    expect(bookingLine({ reference: "BK-1", service: "Studio time", startsAt: stored.starts_at, endsAt: stored.ends_at, timezone: "Asia/Kolkata", blocks: 3 })).toMatch(/^Studio time, .*10:00 am to 1:00 pm \(3 hours\)$/);
  });
  it("the vendor's manual booking takes sessions, the calendar feed spans the range, and rescheduling keeps its length", async () => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId); const date = ahead(55);
    const manual = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.serviceId, date, time: "14:00", blocks: 3, name: "Walk-in Band", email: "band@example.test" } });
    expect(manual.status).toBe(201);
    expect(await row(manual.body.id)).toMatchObject({ blocks_count: 3, block_minutes: 60, total: 450_000 });
    const confirmed = (await pool.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE booking_id=$1 AND template='booking_confirmed_customer'", [manual.body.id])).rows[0];
    expect(confirmed.text_body).toMatch(/2:00 pm to 5:00 pm, 3 hours/);
    const tooMany = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.serviceId, date: ahead(56), time: "09:00", blocks: 5, name: "Walk-in Band", email: "band@example.test" } });
    expect(tooMany.body.error.code).toBe("INVALID_BLOCKS");
    const pastMidnight = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.serviceId, date: ahead(56), time: "22:00", blocks: 3, name: "Late Band", email: "band@example.test" } });
    expect(pastMidnight.body.error.code).toBe("CROSSES_MIDNIGHT");
    const path = (await call("POST", "/v1/vendor/settings/ical", { cookie, body: {} })).body.path as string;
    const feed = (await call("GET", path)).text;
    const compact = (value: string) => value.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    expect(feed).toContain(`DTSTART:${compact(at(date, "14:00"))}`); expect(feed).toContain(`DTEND:${compact(at(date, "17:00"))}`);
    const moved = await call("POST", `/v1/vendor/bookings/${manual.body.id}/reschedule`, { cookie, body: { date: ahead(57), time: "09:00" } });
    expect(moved.status).toBe(200);
    const after = await row(manual.body.id);
    expect(iso(after.starts_at)).toBe(at(ahead(57), "09:00")); expect(iso(after.ends_at)).toBe(at(ahead(57), "12:00")); expect(after.blocks_count).toBe(3);
    // The email shows both whole ranges: the new one and the one it replaced.
    const rescheduled = (await pool.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE booking_id=$1 AND template='booking_rescheduled'", [manual.body.id])).rows[0];
    expect(rescheduled.text_body).toMatch(/9:00 am to 12:00 pm, 3 hours/); expect(rescheduled.text_body).toMatch(/2:00 pm to 5:00 pm, 3 hours/);
  });
  it("the public page lists the session limits and advances the shortest booking", async () => {
    const v = await vendor({ min: 2, max: 4 });
    const page = await call("GET", `/v1/vendors/${v.slug}`);
    expect(page.body.services.find((service: { id: string }) => service.id === v.serviceId)).toMatchObject({ min_blocks: 2, max_blocks: 4, duration_minutes: 60, advance_paise: 90_000, remaining_paise: 210_000 });
  });
});
