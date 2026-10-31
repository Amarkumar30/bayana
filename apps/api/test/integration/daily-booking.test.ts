import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { addLocalDays, localDateOf } from "@bayana/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { acceptTerms, createHold } from "../../src/booking-service.js";
import { loadContract } from "../../src/contract.js";
import { pool, transaction } from "../../src/database.js";
import { sendOutbox } from "../../src/notifications/outbox.js";
import { createUser } from "../helpers.js";

// Per-day bookings (SPEC 8.1): whole local days in the vendor's timezone, guarded by the same exclusion constraint as hourly.
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => { server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
// createHold queues an urgent "hold started" email per hold; the HTTP route would send it straight away. Send them all here (to
// the in-memory capture) so no backlog delays a later file's sign-in code, which is sent oldest-first behind them.
afterAll(async () => { while ((await sendOutbox({ limit: 200 })).sent > 0); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

type Reply = { status: number; body: Record<string, any>; text: string; headers: Headers };
async function call(method: string, path: string, options: { cookie?: string; body?: unknown; key?: string } = {}): Promise<Reply> {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.key ? { "idempotency-key": options.key } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return { status: response.status, body, text, headers: response.headers };
}
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;

type VendorOptions = { timezone?: string; min?: number; max?: number; buffer?: number; price?: number; advance?: { type: "PERCENT" | "FIXED" | "NONE"; value: number }; closedWeekdays?: number[]; published?: boolean };
/** A published vendor open 09:00-18:00 on every weekday (except closedWeekdays), with a daily service and an hourly service. */
async function vendor(options: VendorOptions = {}) {
  const owner = await createUser(pool); const vendorId = randomUUID(), dailyId = randomUUID(), hourlyId = randomUUID(), slug = `daily-${randomUUID().slice(0, 8)}`, timezone = options.timezone ?? "Asia/Kolkata";
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Daily test','Pune','',100000,'PERCENT',20,$4,true,$5,0,365,'The advance confirms the dates.',false)", [vendorId, owner.id, slug, options.published ?? true, timezone]);
  const advance = options.advance ?? { type: "PERCENT", value: 25 };
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,buffer_days,advance_type,advance_value) VALUES($1,$2,'Wedding coverage',$3,NULL,NULL,NULL,'daily',$4,$5,$6,$7,$8)",
    [dailyId, vendorId, options.price ?? 1_200_000, options.min ?? 1, options.max ?? 5, options.buffer ?? 0, advance.type, advance.value]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Portrait hour',200000,60,'hourly','NONE',0)", [hourlyId, vendorId]);
  for (let weekday = 0; weekday < 7; weekday++) if (!(options.closedWeekdays ?? []).includes(weekday)) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), vendorId, weekday]);
  return { vendorId, dailyId, hourlyId, slug, timezone, ownerId: owner.id };
}
type Vendor = Awaited<ReturnType<typeof vendor>>;
const customer = () => createUser(pool, { role: "CLIENT" });
const today = (timezone: string) => localDateOf(new Date(), timezone);
const ahead = (days: number, timezone = "Asia/Kolkata") => addLocalDays(today(timezone), days);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const holdDaily = async (v: Vendor, date: string, days: number, extra: Partial<Parameters<typeof createHold>[1]> = {}) => {
  const user = await customer();
  return transaction(db => createHold(db, { slug: v.slug, date, name: "Meera Shah", email: user.email, clientUserId: user.id, serviceId: v.dailyId, days, key: randomUUID(), ...extra }));
};
const holdHourly = async (v: Vendor, date: string, startsAt: string) => {
  const user = await customer();
  return transaction(db => createHold(db, { slug: v.slug, date, name: "Ravi Iyer", email: user.email, clientUserId: user.id, serviceId: v.hourlyId, startsAt, key: randomUUID() }));
};
const codeOf = async (promise: Promise<unknown>) => { try { await promise; return "OK"; } catch (error) { return (error as { code?: string }).code; } };
const row = async (id: string) => (await pool.query("SELECT booking_mode,days_count,vendor_timezone,starts_at,ends_at,block_start,block_end,total_paise::int AS total,advance_paise::int AS advance,service_price_paise::int AS per_day,local_start_time,duration_minutes FROM bookings WHERE id=$1", [id])).rows[0];
/** Insert a booking straight into the table, bypassing the app, to prove the database constraint itself refuses overlaps. */
const rawInsert = (v: Vendor, blockStart: string, blockEnd: string) => pool.query("INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,idempotency_key,starts_at,ends_at,block_start,block_end) VALUES($1,$2,$3::timestamptz::date,'Raw','raw@example.test','','CONFIRMED',1,0,$4,$3,$5,$3,$5)", [randomUUID(), v.vendorId, blockStart, randomUUID(), blockEnd]);
/** The next local date (at least 2 days away) that satisfies a test. */
function nextDate(test: (date: string) => boolean, timezone = "Asia/Kolkata") { for (let offset = 2; offset < 400; offset++) { const date = ahead(offset, timezone); if (test(date)) return date; } throw new Error("no date found"); }

describe("migration 021", () => {
  it("leaves every service and booking valid under the new constraints, hourly by default", async () => {
    const constraints = (await pool.query("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('services_mode_fields','services_booking_mode_check','bookings_mode_days','bookings_no_overlap') ORDER BY conname")).rows;
    expect(constraints).toEqual([{ conname: "bookings_mode_days", convalidated: true }, { conname: "bookings_no_overlap", convalidated: true }, { conname: "services_booking_mode_check", convalidated: true }, { conname: "services_mode_fields", convalidated: true }]);
    const defaults = (await pool.query("SELECT table_name,column_default FROM information_schema.columns WHERE column_name='booking_mode' AND table_name IN ('services','bookings') ORDER BY table_name")).rows;
    expect(defaults).toEqual([{ table_name: "bookings", column_default: "'hourly'::text" }, { table_name: "services", column_default: "'hourly'::text" }]);
    expect((await pool.query("SELECT count(*)::int AS n FROM services WHERE booking_mode NOT IN ('hourly','daily')")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE vendor_timezone IS NULL")).rows[0].n).toBe(0);
    // An insert that names no mode is an hourly service, exactly as before.
    const v = await vendor(); const id = randomUUID();
    await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,advance_type,advance_value) VALUES($1,$2,'Old style',50000,30,'NONE',0)", [id, v.vendorId]);
    expect((await pool.query("SELECT booking_mode,min_days FROM services WHERE id=$1", [id])).rows[0]).toEqual({ booking_mode: "hourly", min_days: null });
    // A booking inserted without a timezone gets the vendor's.
    const booking = await holdHourly(v, ahead(10), `${ahead(10)}T03:30:00.000Z`);
    expect((await row(booking.id)).vendor_timezone).toBe("Asia/Kolkata");
  });
  it("the database refuses a service that mixes the two modes", async () => {
    const v = await vendor();
    await expect(pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,min_days,max_days,buffer_days,advance_type,advance_value) VALUES($1,$2,'Mixed',50000,60,'daily',1,2,0,'NONE',0)", [randomUUID(), v.vendorId])).rejects.toMatchObject({ code: "23514", constraint: "services_mode_fields" });
    await expect(pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,min_days,advance_type,advance_value) VALUES($1,$2,'Mixed',50000,60,'hourly',1,'NONE',0)", [randomUUID(), v.vendorId])).rejects.toMatchObject({ code: "23514", constraint: "services_mode_fields" });
  });
});

describe("daily service validation (vendor API)", () => {
  const daily = { name: "Wedding day", price_paise: 1_200_000, advance_type: "PERCENT", advance_value: 25, booking_mode: "daily", min_days: 1, max_days: 3 };
  const problems = (reply: Reply) => reply.body.error?.details?.issues ?? reply.body.error?.details ?? reply.body;
  it("creates a daily service with only its own fields", async () => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId);
    const created = await call("POST", "/v1/vendor/services", { cookie, body: daily });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ booking_mode: "daily", min_days: 1, max_days: 3, buffer_days: 0, duration_minutes: null, buffer_before_minutes: null, buffer_after_minutes: null });
  });
  it.each([
    ["a missing price", { ...daily, price_paise: undefined }, "Enter a price."],
    ["min above max", { ...daily, min_days: 4, max_days: 2 }, "The maximum must be at least the minimum number of days."],
    ["more than 30 days", { ...daily, max_days: 31 }, "At most 30 days."],
    ["minutes on a daily service", { ...daily, duration_minutes: 60 }, "Per-day services do not use minutes."],
    ["days on an hourly service", { name: "Cut", price_paise: 50_000, advance_type: "NONE", advance_value: 0, booking_mode: "hourly", duration_minutes: 30, min_days: 2 }, "Per-hour services do not use days."],
    ["an hourly service without a duration", { name: "Cut", price_paise: 50_000, advance_type: "NONE", advance_value: 0, booking_mode: "hourly" }, "Enter how long the service takes, in minutes."],
    ["an unknown mode", { ...daily, booking_mode: "weekly" }, "Choose how you charge: per hour or per day."]
  ])("refuses %s with a plain message", async (_case, body, message) => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId);
    const reply = await call("POST", "/v1/vendor/services", { cookie, body });
    expect(reply.status).toBe(400);
    expect(JSON.stringify(problems(reply))).toContain(message);
  });
  it("switching an hourly service to daily clears its minutes, and back again", async () => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId);
    const toDaily = await call("PATCH", `/v1/vendor/services/${v.hourlyId}`, { cookie, body: { booking_mode: "daily", min_days: 2, max_days: 4 } });
    expect(toDaily.status).toBe(200);
    expect(toDaily.body).toMatchObject({ booking_mode: "daily", min_days: 2, max_days: 4, duration_minutes: null });
    const back = await call("PATCH", `/v1/vendor/services/${v.hourlyId}`, { cookie, body: { booking_mode: "hourly", duration_minutes: 45 } });
    expect(back.body).toMatchObject({ booking_mode: "hourly", duration_minutes: 45, buffer_before_minutes: 0, min_days: null, max_days: null, buffer_days: null });
  });
});

describe("daily bookings occupy exact local days", () => {
  it("a 2-day booking in Asia/Kolkata is [D 00:00 IST, D+2 00:00 IST); price x days and the advance are integer paise", async () => {
    const v = await vendor({ price: 1_200_000 }); const date = ahead(12);
    const booking = await holdDaily(v, date, 2); const stored = await row(booking.id);
    expect(stored.starts_at.toISOString()).toBe(`${addLocalDays(date, -1)}T18:30:00.000Z`);
    expect(stored.ends_at.toISOString()).toBe(`${addLocalDays(date, 1)}T18:30:00.000Z`);
    expect([stored.block_start.toISOString(), stored.block_end.toISOString()]).toEqual([stored.starts_at.toISOString(), stored.ends_at.toISOString()]);
    expect(stored).toMatchObject({ booking_mode: "daily", days_count: 2, vendor_timezone: "Asia/Kolkata", total: 2_400_000, advance: 600_000, per_day: 1_200_000, local_start_time: null, duration_minutes: null });
  });
  it("money stays integer for awkward prices and percentages, and the advance never exceeds the total", async () => {
    const v = await vendor({ price: 1_233_337, advance: { type: "PERCENT", value: 33 }, max: 7 });
    const stored = await row((await holdDaily(v, ahead(14), 3)).id);
    expect(stored.total).toBe(3_700_011);
    expect(stored.advance).toBe(1_221_004); // round half up of 33% (1,221,003.63)
    for (const value of [stored.total, stored.advance]) expect(Number.isInteger(value)).toBe(true);
    const fixed = await vendor({ price: 500_000, advance: { type: "FIXED", value: 500_000 }, max: 3 });
    const fixedRow = await row((await holdDaily(fixed, ahead(14), 3)).id);
    expect(fixedRow).toMatchObject({ total: 1_500_000, advance: 500_000 });
    expect(fixedRow.advance).toBeLessThanOrEqual(fixedRow.total);
  });
  it("back-to-back bookings touch without overlapping (half-open ranges)", async () => {
    const v = await vendor(); const date = ahead(16);
    const first = await holdDaily(v, date, 2), second = await holdDaily(v, addLocalDays(date, 2), 1);
    const [a, b] = [await row(first.id), await row(second.id)];
    expect(a.ends_at.toISOString()).toBe(b.starts_at.toISOString());
  });
  it("an overlap is refused by the exclusion constraint itself, not only by the app", async () => {
    const v = await vendor(); const date = ahead(18);
    const booked = await row((await holdDaily(v, date, 2)).id);
    const middle = new Date(booked.starts_at.getTime() + 36 * 3_600_000).toISOString();
    await expect(rawInsert(v, middle, new Date(booked.ends_at.getTime() + 24 * 3_600_000).toISOString())).rejects.toMatchObject({ code: "23P01", constraint: "bookings_no_overlap" });
    // An hour-long booking inside the days is refused the same way.
    await expect(rawInsert(v, new Date(booked.starts_at.getTime() + 10 * 3_600_000).toISOString(), new Date(booked.starts_at.getTime() + 11 * 3_600_000).toISOString())).rejects.toMatchObject({ code: "23P01", constraint: "bookings_no_overlap" });
    // Touching the end exactly is fine.
    await expect(rawInsert(v, booked.ends_at.toISOString(), new Date(booked.ends_at.getTime() + 3_600_000).toISOString())).resolves.toBeTruthy();
    expect(await codeOf(holdDaily(v, addLocalDays(date, 1), 2))).toBe("SLOT_TAKEN");
  });
  it("buffer days keep the days either side free of other bookings (each booking keeps its own, as hourly buffers do)", async () => {
    const v = await vendor({ buffer: 1 }); const date = ahead(20);
    const stored = await row((await holdDaily(v, date, 1)).id);
    expect(stored.block_start.toISOString()).toBe(`${addLocalDays(date, -2)}T18:30:00.000Z`);
    expect(stored.block_end.toISOString()).toBe(`${addLocalDays(date, 1)}T18:30:00.000Z`);
    // D+1 is this booking's buffer; D+2 would need D+1 as its own buffer too. D+3 is the first possible start.
    expect(await codeOf(holdDaily(v, addLocalDays(date, 1), 1))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdDaily(v, addLocalDays(date, 2), 1))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdDaily(v, addLocalDays(date, 3), 1))).toBe("OK");
  });
});

describe("daily and hourly bookings block each other (any service of the same vendor)", () => {
  it("an hourly booking on a day stops a daily booking that covers it", async () => {
    const v = await vendor(); const date = ahead(22);
    await holdHourly(v, date, `${date}T04:30:00.000Z`); // 10:00 IST
    expect(await codeOf(holdDaily(v, addLocalDays(date, -1), 2))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdDaily(v, addLocalDays(date, 1), 1))).toBe("OK");
  });
  it("a daily booking stops every hourly slot on its days", async () => {
    const v = await vendor(); const date = ahead(24);
    await holdDaily(v, date, 1);
    const slots = await call("GET", `/v1/vendors/${v.slug}/availability/slots?service_id=${v.hourlyId}&date=${date}`);
    expect(slots.body.slots).toEqual([]);
    expect(await codeOf(holdHourly(v, date, `${date}T04:30:00.000Z`))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdHourly(v, addLocalDays(date, 1), `${addLocalDays(date, 1)}T04:30:00.000Z`))).toBe("OK");
  });
});

describe("open days, blocked dates and time off", () => {
  it("a range crossing a closed weekday is refused; one that avoids it works", async () => {
    const closed = 3; const v = await vendor({ closedWeekdays: [closed] });
    const wednesday = nextDate(date => weekdayOf(date) === closed);
    expect(await codeOf(holdDaily(v, addLocalDays(wednesday, -1), 3))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdDaily(v, addLocalDays(wednesday, 1), 3))).toBe("OK");
  });
  it("a blocked date and partial time off each close their whole day", async () => {
    const v = await vendor(); const date = ahead(26);
    await pool.query("INSERT INTO availability_overrides(id,vendor_id,local_date,kind) VALUES($1,$2,$3,'block')", [randomUUID(), v.vendorId, addLocalDays(date, 1)]);
    expect(await codeOf(holdDaily(v, date, 3))).toBe("SLOT_TAKEN");
    const later = ahead(30);
    await pool.query("INSERT INTO blocked_periods(id,vendor_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,'Dentist')", [randomUUID(), v.vendorId, `${later}T08:30:00.000Z`, `${later}T09:30:00.000Z`]);
    expect(await codeOf(holdDaily(v, later, 1))).toBe("SLOT_TAKEN");
    expect(await codeOf(holdDaily(v, addLocalDays(later, 1), 1))).toBe("OK");
  });
  it("ranges crossing a month end and a year end work", async () => {
    const v = await vendor({ max: 5 });
    const monthEnd = nextDate(date => addLocalDays(date, 1).endsWith("-01") && !date.endsWith("-12-31"));
    expect((await row((await holdDaily(v, addLocalDays(monthEnd, -1), 3)).id)).days_count).toBe(3);
    const newYear = nextDate(date => date.endsWith("-12-30"));
    const stored = await row((await holdDaily(v, newYear, 4)).id);
    expect(localDateOf(new Date(stored.ends_at.getTime() - 1), "Asia/Kolkata")).toBe(`${Number(newYear.slice(0, 4)) + 1}-01-02`);
  });
});

describe("timezones other than India, across daylight-saving changes", () => {
  const ny = "America/New_York";
  /** The next US autumn (first Sunday of November) and spring (second Sunday of March) changes, at least two days away. */
  const nextSunday = (month: string, nth: number) => nextDate(date => date.slice(5, 7) === month && weekdayOf(date) === 0 && Math.ceil(Number(date.slice(8)) / 7) === nth, ny);
  it("a New York day is local midnight to local midnight: 25 hours in autumn, 23 in spring", async () => {
    const v = await vendor({ timezone: ny });
    const autumn = nextSunday("11", 1), spring = nextSunday("03", 2);
    const fall = await row((await holdDaily(v, autumn, 1)).id), rise = await row((await holdDaily(v, spring, 1)).id);
    expect(fall.starts_at.toISOString()).toBe(`${autumn}T04:00:00.000Z`); // 00:00 EDT
    expect(fall.ends_at.toISOString()).toBe(`${addLocalDays(autumn, 1)}T05:00:00.000Z`); // 00:00 EST
    expect(rise.starts_at.toISOString()).toBe(`${spring}T05:00:00.000Z`); // 00:00 EST
    expect(rise.ends_at.toISOString()).toBe(`${addLocalDays(spring, 1)}T04:00:00.000Z`); // 00:00 EDT
    expect(fall.ends_at.getTime() - fall.starts_at.getTime()).toBe(25 * 3_600_000);
    expect(rise.ends_at.getTime() - rise.starts_at.getTime()).toBe(23 * 3_600_000);
    expect(fall.vendor_timezone).toBe(ny);
  });
});

describe("holds, concurrency and idempotency", () => {
  it.each([1, 2, 3, 4, 5])("run %i: two parallel holds for overlapping days give exactly one booking", async () => {
    const v = await vendor(); const date = ahead(32);
    const results = await Promise.all([codeOf(holdDaily(v, date, 2)), codeOf(holdDaily(v, addLocalDays(date, 1), 2))]);
    expect(results.sort()).toEqual(["OK", "SLOT_TAKEN"]);
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE vendor_id=$1 AND status IN ('HELD','PENDING','CONFIRMED')", [v.vendorId])).rows[0].n).toBe(1);
  });
  it("an expired hold frees its days", async () => {
    const v = await vendor(); const date = ahead(34);
    const first = await holdDaily(v, date, 2);
    expect(await codeOf(holdDaily(v, date, 2))).toBe("SLOT_TAKEN");
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [first.id]);
    expect(await codeOf(holdDaily(v, date, 2))).toBe("OK");
    expect((await pool.query("SELECT status FROM bookings WHERE id=$1", [first.id])).rows[0].status).toBe("EXPIRED");
  });
  it("retrying with the same idempotency key returns the same booking; different days with that key are refused", async () => {
    const v = await vendor(); const user = await customer(); const key = randomUUID(), date = ahead(36);
    const input = { slug: v.slug, date, name: "Meera Shah", email: user.email, clientUserId: user.id, serviceId: v.dailyId, days: 2, key };
    const first = await transaction(db => createHold(db, input)), again = await transaction(db => createHold(db, input));
    expect(again.id).toBe(first.id);
    expect(await codeOf(transaction(db => createHold(db, { ...input, days: 3 })))).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});

describe("the client cannot set dates, days, prices or the mode", () => {
  it("over HTTP the server ignores a client price and end date, and refuses days outside the service's range", async () => {
    const v = await vendor({ min: 2, max: 3, price: 1_000_000 }); const user = await customer(); const cookie = await sessionFor(user.id); const date = ahead(40);
    const made = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.dailyId, days: 2, name: "Meera Shah", total_paise: 1, price_paise: 1, ends_at: "2099-01-01T00:00:00.000Z" } });
    expect(made.status).toBe(201);
    const stored = await row(made.body.booking.id);
    expect(stored).toMatchObject({ total: 2_000_000, days_count: 2 });
    expect(stored.ends_at.toISOString()).toBe(`${addLocalDays(date, 1)}T18:30:00.000Z`);
    for (const days of [1, 4, 31]) {
      const refused = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date: ahead(44), service_id: v.dailyId, days, name: "Meera Shah" } });
      expect(refused.status).toBe(400);
      expect(refused.body.error.code).toBe(days === 31 ? "VALIDATION_ERROR" : "INVALID_DAYS");
    }
  });
  it("a time for a daily service, or days for an hourly one, is refused: the stored mode decides", async () => {
    const v = await vendor(); const user = await customer(); const cookie = await sessionFor(user.id); const date = ahead(46);
    const timed = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.dailyId, starts_at: `${date}T04:30:00.000Z`, name: "Meera Shah" } });
    expect(timed.body.error.code).toBe("DAILY_SERVICE");
    const daysOnHourly = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.hourlyId, starts_at: `${date}T04:30:00.000Z`, days: 1, name: "Meera Shah" } });
    expect(daysOnHourly.body.error.code).toBe("HOURLY_SERVICE");
    const noDays = await call("POST", "/v1/bookings", { cookie, key: randomUUID(), body: { slug: v.slug, date, service_id: v.dailyId, name: "Meera Shah" } });
    expect(noDays.body.error.code).toBe("DAYS_REQUIRED");
  });
});

describe("public day calendar", () => {
  it("returns each date's status and the longest booking from it, never cached", async () => {
    const v = await vendor({ max: 3, closedWeekdays: [] }); const first = ahead(50);
    await holdDaily(v, addLocalDays(first, 3), 1);
    await pool.query("INSERT INTO availability_overrides(id,vendor_id,local_date,kind) VALUES($1,$2,$3,'block')", [randomUUID(), v.vendorId, addLocalDays(first, 6)]);
    const reply = await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.dailyId}&from=${first}&to=${addLocalDays(first, 7)}`);
    expect(reply.status).toBe(200);
    expect(reply.headers.get("cache-control")).toBe("no-store");
    expect(reply.body).toMatchObject({ timezone: "Asia/Kolkata", min_days: 1, max_days: 3 });
    expect(reply.body.days.map((day: { status: string; max_days: number }) => `${day.status}:${day.max_days}`)).toEqual(["available:3", "available:2", "available:1", "booked:0", "available:2", "available:1", "closed:0", "available:3"]); // the last date looks beyond the range
    const past = await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.dailyId}&from=${ahead(-2)}&to=${ahead(-1)}`);
    expect(past.body.days.map((day: { status: string }) => day.status)).toEqual(["past", "past"]);
  });
  it("respects the minimum number of days when reporting where a booking can start", async () => {
    const v = await vendor({ min: 2, max: 2 }); const first = ahead(60);
    await holdDaily(v, addLocalDays(first, 1), 2);
    const days = (await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.dailyId}&from=${first}&to=${first}`)).body.days;
    expect(days).toEqual([{ date: first, status: "available", max_days: 0 }]);
  });
  it("unpublished and unknown vendors get the same 404; hourly services, bad and long ranges are refused", async () => {
    const hidden = await vendor({ published: false });
    const unpublished = await call("GET", `/v1/vendors/${hidden.slug}/availability/days?service_id=${hidden.dailyId}&month=${ahead(10).slice(0, 7)}`);
    const unknown = await call("GET", `/v1/vendors/no-such-${randomUUID().slice(0, 8)}/availability/days?service_id=${hidden.dailyId}&month=${ahead(10).slice(0, 7)}`);
    expect([unpublished.status, unknown.status]).toEqual([404, 404]);
    expect(unpublished.text).toBe(unknown.text);
    const v = await vendor();
    expect((await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.hourlyId}&month=${ahead(10).slice(0, 7)}`)).body.error.code).toBe("HOURLY_SERVICE");
    expect((await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.dailyId}&from=${ahead(10)}&to=${ahead(80)}`)).body.error.code).toBe("INVALID_RANGE");
    const month = await call("GET", `/v1/vendors/${v.slug}/availability/days?service_id=${v.dailyId}&month=2026-02`);
    expect(month.body.days).toHaveLength(28);
  });
});

describe("dates, never times, wherever a daily booking is shown", () => {
  it("the contract names the dates and the per-day price; the hold email shows the range; an hourly contract is unchanged", async () => {
    const v = await vendor({ price: 1_200_000 }); const date = ahead(70);
    const booking = await holdDaily(v, date, 2);
    const contract = (await loadContract(pool, booking.id))!;
    expect(contract.text).toContain("Dates: ");
    expect(contract.text).toContain("(2 days), whole days (Asia/Kolkata)");
    expect(contract.text).toContain("Price per day: ₹12,000.00 x 2 days");
    expect(contract.text).toContain("Total price: ₹24,000.00");
    expect(contract.text).not.toContain("Date and time");
    // The hold email is queued in the outbox with the booking (the route sends it right after the request).
    const mail = (await pool.query<{ subject: string; text_body: string }>("SELECT subject,text_body FROM email_outbox WHERE booking_id=$1 AND template='hold_started'", [booking.id])).rows[0];
    expect(mail.text_body).toContain("(2 days)");
    // Its When line is the date range; the only time in it is the payment deadline of the hold, never a midnight booking time.
    expect(mail.text_body).toMatch(/When:?\s+\d{1,2} \w{3}( \d{4})? to \d{1,2} \w{3} \d{4} \(2 days\)/);
    expect(mail.text_body).not.toMatch(/12:00 am/i);
    const hourly = await holdHourly(v, ahead(72), `${ahead(72)}T04:30:00.000Z`);
    expect((await loadContract(pool, hourly.id))!.text).toMatch(/Date and time: .*, 10:00 am \(Asia\/Kolkata\)/);
  });
  it("accepting the daily contract records it and confirms when nothing is due", async () => {
    const v = await vendor({ advance: { type: "NONE", value: 0 } }); const user = await customer(); const date = ahead(74);
    const booking = await transaction(db => createHold(db, { slug: v.slug, date, name: "Meera Shah", email: user.email, clientUserId: user.id, serviceId: v.dailyId, days: 1, key: randomUUID() }));
    const contract = (await loadContract(pool, booking.id))!;
    const accepted = await transaction(db => acceptTerms(db, { bookingId: booking.id, termsHash: contract.sha256, email: user.email, ip: "203.0.113.9", userAgent: "vitest" }));
    expect(accepted.booking.status).toBe("CONFIRMED");
  });
  it("the calendar feed has daily bookings as all-day events with an exclusive end date", async () => {
    const v = await vendor(); const cookie = await sessionFor(v.ownerId); const date = ahead(76);
    const manual = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.dailyId, date, days: 3, name: "Walk-in Couple", email: "couple@example.test" } });
    expect(manual.status).toBe(201);
    const path = (await call("POST", "/v1/vendor/settings/ical", { cookie, body: {} })).body.path as string;
    const feed = (await call("GET", path)).text;
    expect(feed).toContain(`DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`);
    expect(feed).toContain(`DTEND;VALUE=DATE:${addLocalDays(date, 3).replaceAll("-", "")}`);
  });
  it("the vendor's manual daily booking is priced per day, and rescheduling keeps its number of days", async () => {
    const v = await vendor({ price: 900_000 }); const cookie = await sessionFor(v.ownerId); const date = ahead(80);
    const manual = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.dailyId, date, days: 2, name: "Phone Booking", email: "phone@example.test" } });
    expect(await row(manual.body.id)).toMatchObject({ booking_mode: "daily", days_count: 2, total: 1_800_000, per_day: 900_000 });
    const timed = await call("POST", "/v1/vendor/bookings", { cookie, key: randomUUID(), body: { service_id: v.dailyId, date: ahead(84), time: "10:00", name: "Phone Booking", email: "phone@example.test" } });
    expect(timed.body.error.code).toBe("DAILY_SERVICE");
    const moved = await call("POST", `/v1/vendor/bookings/${manual.body.id}/reschedule`, { cookie, body: { date: ahead(90) } });
    expect(moved.status).toBe(200);
    const after = await row(manual.body.id);
    expect(after.days_count).toBe(2);
    expect(after.starts_at.toISOString()).toBe(`${addLocalDays(ahead(90), -1)}T18:30:00.000Z`);
    expect(after.ends_at.toISOString()).toBe(`${addLocalDays(ahead(90), 1)}T18:30:00.000Z`);
  });
});
