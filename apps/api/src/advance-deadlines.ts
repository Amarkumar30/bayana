import type { PoolClient } from "pg";
import { awaitsOfflineSql, deadlineKeySql, expireOverdueHolds } from "./booking-transition.js";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { log } from "./logger.js";
import { notifyAdvanceReminder } from "./notifications/booking-mail.js";
import { kickOutbox } from "./notifications/outbox.js";
import { paidSql } from "./payments/service.js";

// Offline advances have a deadline (bookings.hold_expires_at, set when the customer agrees). What happens at that deadline
// never depends on a timer: every read of a vendor's bookings settles them, any API request starts a sweep at most once a
// minute, and the tick is the backstop for when nobody uses the app.

const REMINDER_HOURS = 6;
const reminderDue = (vendor: string) => `b.status='PENDING' AND b.hold_expires_at > now() AND b.hold_expires_at <= now() + interval '${REMINDER_HOURS} hours' ${vendor}
  AND b.advance_paise > ${paidSql("b.id")} AND ${awaitsOfflineSql("b")}
  AND NOT EXISTS(SELECT 1 FROM email_outbox o WHERE o.dedupe_key='advance-reminder:' || b.id || ':' || ${deadlineKeySql("b")} || ':customer')`;

/** Queues the reminder for each deadline about 6 hours away. Overlapping runs are safe: the outbox's dedupe keys allow one per deadline. */
export async function queueDeadlineReminders(db: PoolClient, vendorId: string | null) {
  const due = await db.query<{ id: string; deadline_key: string }>(`SELECT b.id,${deadlineKeySql("b")} AS deadline_key FROM bookings b WHERE ${reminderDue(vendorId ? "AND b.vendor_id=$1" : "")}`, vendorId ? [vendorId] : []);
  for (const row of due.rows) await notifyAdvanceReminder(db, row.id, row.deadline_key);
  return due.rows.length;
}

/** Expires what is overdue and queues what is due, for one vendor or all. Costs one read when there is nothing to do. */
export async function settleDeadlines(vendorId: string | null) {
  const scope = vendorId ? "AND b.vendor_id=$1" : "";
  const work = await pool.query(`SELECT 1 FROM bookings b WHERE (b.status IN ('HELD','PENDING') AND b.hold_expires_at < now() ${scope}) OR (${reminderDue(scope)}) LIMIT 1`, vendorId ? [vendorId] : []);
  if (!work.rowCount) return;
  await transaction(async db => { await expireOverdueHolds(db, vendorId); await queueDeadlineReminders(db, vendorId); });
  kickOutbox();
}

/** For reads: the page shows the state it can (the views treat a lapsed deadline as expired) even if settling fails. */
export const settleForRead = (vendorId: string) => settleDeadlines(vendorId).catch((error: unknown) => log("error", "deadlines.settle_failed", { err: error instanceof Error ? error.message : String(error) }));

const SWEEP_EVERY_MS = 60_000;
let nextSweep = 0;
/** After any API request, at most once a minute per process: every vendor's deadlines. Off in tests, which share one database. */
export function sweepDeadlinesSoon() {
  if (config.NODE_ENV === "test" || Date.now() < nextSweep) return;
  nextSweep = Date.now() + SWEEP_EVERY_MS;
  setImmediate(() => { settleDeadlines(null).catch((error: unknown) => log("error", "deadlines.sweep_failed", { err: error instanceof Error ? error.message : String(error) })); });
}
