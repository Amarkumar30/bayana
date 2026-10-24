import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
import { startSession } from "../../src/auth.js";
import { pool, transaction } from "../../src/database.js";
import { capturedEmails, useTestTransport } from "../../src/email.js";
import { BACKOFF_MINUTES, enqueue, PRIORITY, sendOutbox } from "../../src/notifications/outbox.js";
import { renderTemplate, templates, type TemplateData } from "../../src/notifications/templates.js";
import { createUser } from "../helpers.js";

// SPEC 15: outbox, templates, tick and nightly jobs. Test files run one at a time (vitest.config.ts) because the jobs
// here send every due email in the shared _test database.
const TICK = "integration-tests-tick-secret-0123456789";
let server: ReturnType<typeof app.listen>; let base = "";
beforeAll(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Earlier runs leave queued mail behind; deliver it (to the in-memory capture) so these tests start from an empty queue.
  for (let round = 0; round < 200; round++) { const result = await sendOutbox({ limit: 200 }); if (!result.sent && !result.retrying && !result.failed) break; }
}, 120_000);
afterAll(async () => { useTestTransport(null); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); });

async function call(method: string, path: string, options: { cookie?: string; body?: unknown; headers?: Record<string, string>; key?: string } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`, ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.key ? { "idempotency-key": options.key } : {}), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, any> };
}
const tick = (secret = TICK) => call("POST", "/internal/jobs/tick", { headers: { authorization: `Bearer ${secret}` } });
const sessionFor = async (userId: string) => `bayana_session=${await transaction(db => startSession(db, userId))}`;
const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => { for (let attempt = 0; attempt < 150; attempt++) { const value = await read(); if (done(value)) return value; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error("condition never met"); };

async function vendor() {
  const owner = await createUser(pool); const id = randomUUID(), serviceId = randomUUID(), slug = `mail-${randomUUID().slice(0, 8)}`;
  await pool.query("INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,base_price_paise,advance_type,advance_value,published,bookings_enabled,timezone,min_notice_minutes,max_advance_days,terms,phone_required) VALUES($1,$2,$3,'Studio Mail','Pune','',100000,'PERCENT',20,true,true,'Asia/Kolkata',0,365,'Advance confirms.',false)", [id, owner.id, slug]);
  await pool.query("INSERT INTO services(id,vendor_id,name,price_paise,duration_minutes,booking_mode,advance_type,advance_value) VALUES($1,$2,'Session',100000,60,'TIMED','PERCENT',20)", [serviceId, id]);
  for (let weekday = 0; weekday < 7; weekday++) await pool.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,'09:00','18:00')", [randomUUID(), id, weekday]);
  return { id, serviceId, slug, ownerEmail: owner.email };
}
/** A CONFIRMED booking starting in `hoursAhead`, made three days ago (so it is due a reminder). */
async function confirmedBooking(hoursAhead: number, options: { withPayment?: boolean } = {}) {
  const v = await vendor(); const id = randomUUID(); const starts = new Date(Date.now() + hoursAhead * 3_600_000);
  await pool.query(`INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,idempotency_key,starts_at,ends_at,block_start,block_end,service_name,created_at,terms_accepted_at)
    VALUES($1,$2,$3,'Asha Rao',$4,'','CONFIRMED',100000,20000,$5,$6,$7,$6,$7,'Session',now()-interval '3 days',now())`, [id, v.id, starts.toISOString().slice(0, 10), `asha-${id.slice(0, 8)}@example.test`, randomUUID(), starts, new Date(starts.getTime() + 3_600_000)]);
  await pool.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason) VALUES($1,$2,NULL,'CONFIRMED','test','seeded')", [randomUUID(), id]);
  if (options.withPayment !== false) {
    const owner = (await pool.query<{ owner_user_id: string }>("SELECT owner_user_id FROM vendors WHERE id=$1", [v.id])).rows[0].owner_user_id;
    await pool.query("INSERT INTO payments(id,booking_id,provider,status,amount_paise,verified_at,method,note,recorded_by) VALUES($1,$2,'offline','captured',20000,now(),'cash','seeded',$3)", [randomUUID(), id, owner]);
  }
  return { id, vendor: v };
}

const sample: { [K in keyof TemplateData]: TemplateData[K] } = (() => {
  const facts = { businessName: "Studio <Sunday>", customerName: "Asha <script>alert(1)</script>", service: "Portrait session", startsAt: "2026-11-02T04:30:00Z", timezone: "Asia/Kolkata", totalPaise: 800000, advancePaise: 200000, paidPaise: 200000, link: "https://bayana.in/b/x" };
  return {
    otp: { code: "123456", action: "sign in", minutes: 10 }, hold_started: { ...facts, holdUntil: "2026-10-30T10:00:00Z", online: true }, booking_request_vendor: { ...facts, customerEmail: "asha@example.in" },
    booking_confirmed_customer: { ...facts, cancellation: "Full refund until 48 hours before." }, booking_confirmed_vendor: { ...facts, customerEmail: "asha@example.in" },
    booking_cancelled: { ...facts, audience: "customer", cancelledBy: "customer", reason: "Plans changed", refundPaise: 100000, refundManual: false }, refund_issued: { businessName: "Studio", customerName: "Asha", amountPaise: 100000, service: "Portrait", link: "https://bayana.in/b/x" },
    reminder_24h: { ...facts, audience: "customer", place: "Bandra", customerEmail: "asha@example.in" }, payment_review: { problem: "Amount differs", bookingId: "b1", lines: ["Payment pay_1"] }, payment_recorded: { ...facts, amountPaise: 200000, kind: "advance", confirmed: true }
  };
})();

describe("templates (SPEC 15.2)", () => {
  it("every template has a subject, a plain-text part and escaped HTML with no images or tracking", () => {
    for (const name of Object.keys(templates) as (keyof TemplateData)[]) {
      const email = renderTemplate(name, sample[name] as never);
      expect(email.subject.length, name).toBeGreaterThan(5);
      expect(email.text.length, name).toBeGreaterThan(20);
      expect(email.html, name).toContain("<!doctype html>");
      expect(email.html, name).not.toMatch(/<img|<script/i);
      expect(email.html, name).not.toContain("Asha <script>");
    }
    expect(renderTemplate("otp", sample.otp).subject).toBe("Your Bayana code: 123456");
    expect(renderTemplate("booking_confirmed_customer", sample.booking_confirmed_customer).text).toContain("Balance due: ₹6,000.00");
    expect(renderTemplate("booking_cancelled", sample.booking_cancelled).text).toContain("₹1,000.00 is being refunded");
  });
});

describe("outbox delivery (SPEC 15.1)", () => {
  it("SMTP being down never breaks a booking; the email retries after 1, 5, 30 and 120 minutes, then is marked failed", async () => {
    useTestTransport(async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:587"); });
    try {
      const v = await vendor(); const customer = await createUser(pool, { role: "CLIENT" });
      const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
      const held = await call("POST", "/v1/bookings", { cookie: await sessionFor(customer.id), key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: `${day}T03:30:00.000Z`, name: "Asha Rao" } });
      expect(held.status).toBe(201);
      const rowFor = () => pool.query<{ id: string; status: string; attempts: number; wait: number }>("SELECT id,status,attempts,EXTRACT(EPOCH FROM next_attempt_at-now())::int AS wait FROM email_outbox WHERE booking_id=$1 AND template='hold_started'", [held.body.booking.id]).then(result => result.rows[0]);
      // The first attempt is the immediate send right after the booking committed (kickUrgent); the rest come from ticks.
      const first = await until(rowFor, value => value?.attempts === 1);
      expect(first.status).toBe("queued");
      expect(first.wait).toBeGreaterThan(BACKOFF_MINUTES[0] * 60 - 10); expect(first.wait).toBeLessThanOrEqual(BACKOFF_MINUTES[0] * 60);
      for (const [index, minutes] of BACKOFF_MINUTES.entries()) {
        if (index === 0) continue;
        await pool.query("UPDATE email_outbox SET next_attempt_at=now() WHERE booking_id=$1 AND template='hold_started'", [held.body.booking.id]);
        await sendOutbox({ limit: 50 });
        const row = await until(rowFor, value => value.attempts === index + 1);
        expect(row.status).toBe("queued");
        expect(row.wait).toBeGreaterThan(minutes * 60 - 10); expect(row.wait).toBeLessThanOrEqual(minutes * 60);
      }
      await pool.query("UPDATE email_outbox SET next_attempt_at=now() WHERE booking_id=$1 AND template='hold_started'", [held.body.booking.id]);
      await sendOutbox({ limit: 50 });
      expect(await until(rowFor, value => value.attempts === 5)).toMatchObject({ status: "failed", attempts: 5 });
      expect((await pool.query("SELECT status FROM bookings WHERE id=$1", [held.body.booking.id])).rows[0].status).toBe("HELD");
    } finally { useTestTransport(null); }
  });
  it("sends urgent mail (codes, payments) before reminders", async () => {
    const normal = await enqueue(pool, "payment_review", "ops@example.test", sample.payment_review, { priority: PRIORITY.normal });
    const urgent = await enqueue(pool, "otp", "someone@example.test", sample.otp, { priority: PRIORITY.urgent });
    await sendOutbox({ limit: 1 });
    const rows = (await pool.query<{ id: string; status: string }>("SELECT id,status FROM email_outbox WHERE id = ANY($1)", [[normal, urgent]])).rows;
    expect(Object.fromEntries(rows.map(row => [row.id, row.status]))).toEqual({ [urgent!]: "sent", [normal!]: "queued" });
    await sendOutbox({ limit: 10 });
  });
  it("login codes go through the outbox, arrive at once, and are not kept after sending", async () => {
    const email = `code-${randomUUID().slice(0, 8)}@example.test`; const before = capturedEmails().length;
    expect((await call("POST", "/v1/auth/booking/otp/request", { body: { email } })).status).toBe(202);
    const message = await until(async () => capturedEmails().slice(before).find(item => item.to === email), Boolean);
    expect(message?.subject).toMatch(/^Your Bayana code: \d{6}$/);
    const row = await until(() => pool.query<{ status: string; priority: number; text_body: string }>("SELECT status,priority,text_body FROM email_outbox WHERE recipient=$1", [email]).then(result => result.rows[0]), value => value?.status === "sent");
    expect(row).toEqual({ status: "sent", priority: 0, text_body: "[code removed after sending]" });
  });
});

describe("tick (SPEC 15.3)", () => {
  it("refuses a missing or wrong secret and records every job it runs", async () => {
    expect((await call("POST", "/internal/jobs/tick")).status).toBe(401);
    expect((await tick("wrong-secret-wrong-secret-wrong-secret")).status).toBe(401);
    const started = new Date();
    const reply = await tick();
    expect(reply.status).toBe(200);
    expect(reply.body.results.map((result: { job: string; status: string }) => `${result.job}:${result.status}`)).toEqual(["expire_holds:ok", "process_webhooks:ok", "send_reminders:ok", "send_outbox:ok"]);
    const runs = (await pool.query("SELECT job,status,trigger FROM job_runs WHERE started_at >= $1 ORDER BY started_at", [started])).rows;
    expect(runs).toEqual(expect.arrayContaining([{ job: "send_outbox", status: "ok", trigger: "tick" }, { job: "expire_holds", status: "ok", trigger: "tick" }]));
  });
  it("two overlapping ticks queue and send exactly one reminder per person", async () => {
    const booking = await confirmedBooking(20);
    const before = capturedEmails().length;
    await Promise.all([tick(), tick()]);
    expect((await pool.query("SELECT recipient::text FROM email_outbox WHERE booking_id=$1 AND template='reminder_24h' ORDER BY recipient", [booking.id])).rows).toHaveLength(2);
    expect((await pool.query("SELECT reminder_sent_at IS NOT NULL AS done FROM bookings WHERE id=$1", [booking.id])).rows[0].done).toBe(true);
    await tick();
    const reminders = capturedEmails().slice(before).filter(email => email.subject.startsWith("Tomorrow:") && (email.to.startsWith("asha-") ? email.to.includes(booking.id.slice(0, 8)) : email.to === booking.vendor.ownerEmail));
    expect(reminders).toHaveLength(2);
    // Running again later changes nothing.
    const again = await tick();
    expect(again.body.results.find((result: { job: string }) => result.job === "send_reminders").reminders).toBe(0);
  });
  it("skips bookings made inside the last day (they just got a confirmation) and bookings far away", async () => {
    const soon = await confirmedBooking(30), fresh = await confirmedBooking(10);
    await pool.query("UPDATE bookings SET created_at=now() WHERE id=$1", [fresh.id]);
    await tick();
    const rows = (await pool.query("SELECT id,reminder_sent_at FROM bookings WHERE id = ANY($1)", [[soon.id, fresh.id]])).rows;
    expect(rows.every(row => row.reminder_sent_at === null)).toBe(true);
  });
  it("expires overdue holds through transitionBooking", async () => {
    const v = await vendor(); const customer = await createUser(pool, { role: "CLIENT" });
    const day = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    const held = await call("POST", "/v1/bookings", { cookie: await sessionFor(customer.id), key: randomUUID(), body: { slug: v.slug, date: day, service_id: v.serviceId, starts_at: `${day}T03:30:00.000Z`, name: "Asha Rao" } });
    await pool.query("UPDATE bookings SET hold_expires_at=now()-interval '1 minute' WHERE id=$1", [held.body.booking.id]);
    await tick();
    expect((await pool.query("SELECT to_status,actor FROM booking_events WHERE booking_id=$1 ORDER BY created_at DESC LIMIT 1", [held.body.booking.id])).rows[0]).toEqual({ to_status: "EXPIRED", actor: "system" });
  });
});

describe("nightly", () => {
  it("cleans up per retention and reports integrity problems to OPS_EMAIL without fixing them", async () => {
    const broken = await confirmedBooking(72, { withPayment: false });
    const email = `old-${randomUUID().slice(0, 8)}@example.test`;
    await call("POST", "/v1/auth/booking/otp/request", { body: { email } });
    await pool.query("UPDATE otp_codes SET created_at=now()-interval '2 days' WHERE email_normalized=$1", [email]);
    const reply = await call("POST", "/internal/jobs/nightly", { headers: { authorization: `Bearer ${TICK}` } });
    expect(reply.status).toBe(200);
    const byJob = Object.fromEntries(reply.body.results.map((result: { job: string }) => [result.job, result]));
    expect(byJob.reconcile_payments).toMatchObject({ status: "ok", skipped: "payments disabled" });
    expect(byJob.cleanup.otp_codes_deleted).toBeGreaterThanOrEqual(1);
    expect(byJob.consistency_check.confirmed_without_payment).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM otp_codes WHERE email_normalized=$1", [email])).rows[0].n).toBe(0);
    // The review email lists findings (the first ten per check); this booking is counted even if older test rows fill the list.
    const review = (await pool.query<{ text_body: string }>("SELECT text_body FROM email_outbox WHERE template='payment_review' AND recipient='ops@example.test' AND dedupe_key LIKE 'review:consistency:%' ORDER BY created_at DESC LIMIT 1")).rows[0];
    expect(review.text_body).toContain("confirmed_without_payment:");
    expect((await pool.query("SELECT 1 FROM bookings b WHERE b.id=$1 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id)", [broken.id])).rowCount).toBe(1);
    expect((await pool.query("SELECT status FROM bookings WHERE id=$1", [broken.id])).rows[0].status).toBe("CONFIRMED");
  });
});
