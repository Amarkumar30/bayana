import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { expireOverdueHolds } from "./booking-transition.js";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { log } from "./logger.js";
import { bookingFacts, notifyReview } from "./notifications/booking-mail.js";
import { enqueue, kickUrgent, sendOutbox } from "./notifications/outbox.js";
import { reconcile } from "./payments/reconcile.js";
import { paymentProvider, paymentsEnabled } from "./payments/runtime.js";
import { processPendingWebhooks } from "./payments/webhooks.js";

// Background jobs (SPEC 15.3). Nothing runs on a timer inside the API: a scheduler (GitHub Actions) calls
// POST /internal/jobs/tick and /internal/jobs/nightly. Every job is safe to run late, twice, or at the same time as itself.

export type JobName = "expire_holds" | "send_outbox" | "send_reminders" | "process_webhooks" | "reconcile_payments" | "cleanup" | "consistency_check";
type Trigger = "tick" | "nightly" | "manual";

/** Constant-time check of the Bearer secret. Without TICK_SECRET configured, jobs cannot be triggered over HTTP at all. */
export function tickAuthorized(header: string | undefined) {
  if (!config.TICK_SECRET || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(config.TICK_SECRET));
}

/** One review email per day per distinct set of findings: the same findings twice in a day do not email twice. */
const findingsKey = (lines: string[]) => `${new Date().toISOString().slice(0, 10)}:${createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16)}`;

async function run(job: JobName, trigger: Trigger, work: () => Promise<Record<string, unknown>>) {
  const id = randomUUID();
  await pool.query("INSERT INTO job_runs(id,job,trigger) VALUES($1,$2,$3)", [id, job, trigger]);
  try {
    const details = await work();
    await pool.query("UPDATE job_runs SET status='ok',finished_at=now(),details=$2 WHERE id=$1", [id, JSON.stringify(details)]);
    return { job, status: "ok" as const, ...details };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    await pool.query("UPDATE job_runs SET status='failed',finished_at=now(),error=$2 WHERE id=$1", [id, message]);
    log("error", "job.failed", { job, trigger, err: message.slice(0, 200) });
    // One failing job never stops the others in the same tick.
    return { job, status: "failed" as const, error: "see job_runs" };
  }
}

// ---- Every tick ---------------------------------------------------------------------------------------------------
const expireHolds = async () => ({ expired: await transaction(db => expireOverdueHolds(db, null)) });

async function sendAllDue() {
  const total = { sent: 0, retrying: 0, failed: 0 };
  // Bounded so a large backlog cannot hold the request open for long; the next tick continues.
  for (let round = 0; round < 8; round++) {
    const result = await sendOutbox({ limit: 25 });
    total.sent += result.sent; total.retrying += result.retrying; total.failed += result.failed;
    if (result.sent + result.retrying + result.failed < 25) break;
  }
  return total;
}

/**
 * 24-hour reminders, once per booking. The UPDATE … WHERE reminder_sent_at IS NULL claims the booking atomically, so
 * overlapping ticks cannot both win; the dedupe keys make a second email impossible even if they did.
 * Bookings made inside the last day before their start already got a confirmation, so they get no reminder.
 */
async function sendReminders() {
  const due = await pool.query<{ id: string }>("SELECT id FROM bookings WHERE status='CONFIRMED' AND reminder_sent_at IS NULL AND starts_at > now() AND starts_at <= now() + interval '24 hours' AND created_at < starts_at - interval '24 hours' ORDER BY starts_at LIMIT 200");
  let queued = 0;
  for (const { id } of due.rows) {
    const claimed = await transaction(async db => {
      const won = await db.query("UPDATE bookings SET reminder_sent_at=now() WHERE id=$1 AND reminder_sent_at IS NULL AND status='CONFIRMED' RETURNING id", [id]);
      if (!won.rowCount) return false;
      const booking = await bookingFacts(db, id);
      await enqueue(db, "reminder_24h", booking.customerEmail, { ...booking.facts, audience: "customer", place: booking.place, customerEmail: booking.customerEmail }, { bookingId: id, dedupeKey: `reminder:${id}:customer`, senderName: booking.facts.businessName });
      const vendorEmail = booking.vendorEmailFor("reminder_24h");
      if (vendorEmail) await enqueue(db, "reminder_24h", vendorEmail, { ...booking.facts, audience: "vendor", place: booking.place, customerEmail: booking.customerEmail }, { bookingId: id, dedupeKey: `reminder:${id}:vendor` });
      return true;
    });
    if (claimed) queued++;
  }
  return { reminders: queued };
}

const processWebhooks = async () => {
  if (!paymentsEnabled()) return { skipped: "payments disabled" };
  const before = (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM webhook_events WHERE processed_at IS NULL AND needs_review=false")).rows[0].n;
  await processPendingWebhooks();
  return { waiting_before: before };
};

export async function runTick(trigger: Trigger = "tick") {
  // Order matters: expire first (frees slots, queues nothing), retry webhooks (may confirm and queue mail), queue reminders, then send.
  const results = [await run("expire_holds", trigger, expireHolds), await run("process_webhooks", trigger, processWebhooks), await run("send_reminders", trigger, sendReminders), await run("send_outbox", trigger, sendAllDue)];
  return { ok: results.every(result => result.status === "ok"), results };
}

// ---- Nightly ------------------------------------------------------------------------------------------------------
async function reconcilePayments() {
  if (!paymentsEnabled()) return { skipped: "payments disabled" };
  const report = await reconcile(pool, paymentProvider(), { hours: 48 });
  if (report.differences.length) await notifyReview(pool, `Reconcile found ${report.differences.length} difference(s)`, null, report.differences.map(item => `${item.kind}: ${item.detail}${item.booking_id ? ` (booking ${item.booking_id})` : ""}`), `reconcile:${findingsKey(report.differences.map(item => `${item.kind}:${item.booking_id}:${item.provider_id}`))}`);
  return { checked_payments: report.checked.payments, checked_refunds: report.checked.refunds, differences: report.differences.length };
}

/** Retention (SPEC 17.6). Deletes or trims personal and secret data past its keep date; never touches money records. */
async function cleanup() {
  const otp = await pool.query("DELETE FROM otp_codes WHERE created_at < now() - interval '1 day'");
  const sessions = await pool.query("DELETE FROM sessions WHERE (expires_at < now() - interval '30 days') OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')");
  const webhooks = await pool.query("UPDATE webhook_events SET payload=jsonb_build_object('event', type, 'trimmed', true) WHERE received_at < now() - interval '90 days' AND NOT (payload ? 'trimmed')");
  const stuck = await pool.query("UPDATE webhook_events SET needs_review=true, error=COALESCE(error,'') || ' (still waiting after a day)' WHERE processed_at IS NULL AND needs_review=false AND received_at < now() - interval '1 day'");
  const bodies = await pool.query("UPDATE email_outbox SET text_body='[removed after 90 days]', html_body=NULL, body_purged_at=now() WHERE created_at < now() - interval '90 days' AND body_purged_at IS NULL AND status <> 'queued'");
  // A login code that was never delivered has expired after 10 minutes; do not keep it.
  const codes = await pool.query("UPDATE email_outbox SET subject='Your Bayana code', text_body='[expired code removed]', html_body=NULL, body_purged_at=now(), status=CASE WHEN status='queued' THEN 'failed' ELSE status END, failed_at=CASE WHEN status='queued' THEN now() ELSE failed_at END WHERE template='otp' AND body_purged_at IS NULL AND created_at < now() - interval '15 minutes'");
  return { otp_codes_deleted: otp.rowCount, sessions_deleted: sessions.rowCount, webhook_payloads_trimmed: webhooks.rowCount, webhooks_flagged_stuck: stuck.rowCount, email_bodies_removed: bodies.rowCount, expired_code_emails_removed: codes.rowCount };
}

/** SPEC 17.4 integrity queries. Findings are reported (job details plus a review email), never auto-fixed. */
async function consistencyCheck() {
  const checks: Record<string, string> = {
    confirmed_without_payment: "SELECT b.id FROM bookings b WHERE b.status IN ('CONFIRMED','COMPLETED') AND b.advance_paise > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status IN ('captured','refunded','partially_refunded') AND p.verified_at IS NOT NULL) LIMIT 50",
    holds_past_expiry: "SELECT id FROM bookings WHERE status IN ('HELD','PENDING') AND hold_expires_at < now() - interval '1 hour' LIMIT 50",
    bookings_without_events: "SELECT b.id FROM bookings b LEFT JOIN booking_events e ON e.booking_id=b.id WHERE e.id IS NULL LIMIT 50",
    paid_after_expiry_unrefunded: "SELECT b.id FROM bookings b WHERE b.status='EXPIRED_PAID' AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.booking_id=b.id AND r.status IN ('pending','processed')) LIMIT 50",
    emails_failed: "SELECT id FROM email_outbox WHERE status='failed' AND failed_at > now() - interval '1 day' LIMIT 50",
    webhooks_needing_review: "SELECT event_id AS id FROM webhook_events WHERE needs_review LIMIT 50"
  };
  const found: Record<string, number> = {}; const lines: string[] = [];
  for (const [name, sql] of Object.entries(checks)) {
    const rows = (await pool.query<{ id: string }>(sql)).rows;
    found[name] = rows.length;
    for (const row of rows.slice(0, 10)) lines.push(`${name}: ${row.id}`);
  }
  const total = Object.values(found).reduce((sum, count) => sum + count, 0);
  if (total) await notifyReview(pool, `Consistency check found ${total} item(s)`, null, lines, `consistency:${findingsKey(lines)}`);
  return { ...found, total };
}

export async function runNightly(trigger: Trigger = "nightly") {
  const results = [await run("reconcile_payments", trigger, reconcilePayments), await run("cleanup", trigger, cleanup), await run("consistency_check", trigger, consistencyCheck)];
  kickUrgent();
  return { ok: results.every(result => result.status === "ok"), results };
}
