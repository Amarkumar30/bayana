import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "./errors.js";

// The only file allowed to write bookings.status (SPEC 10.1, BK-07); test/unit/status-writes.test.ts enforces it.

export type BookingStatus = "HELD" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "EXPIRED_PAID";
type Locked = { id: string; vendor_id: string; status: BookingStatus; hold_expires_at: Date | null; ends_at: Date; advance_paise: string; terms_accepted_at: Date | null };
type Meta = Record<string, unknown>;
type Guard = (booking: Locked, meta: Meta, db: PoolClient) => Promise<string | null> | string | null;

const holdLive = (booking: Locked) => booking.hold_expires_at && booking.hold_expires_at > new Date() ? null : "The hold has expired";
const holdOver = (booking: Locked) => booking.hold_expires_at && booking.hold_expires_at < new Date() ? null : "The hold has not expired yet";
const hasReason = (_booking: Locked, meta: Meta) => typeof meta.reason === "string" && meta.reason.trim() ? null : "A reason is required";
/** PY-05: confirmation needs a verified payment row of this booking (online captured, or offline recorded by the vendor). */
const paidBy = async (booking: Locked, meta: Meta, db: PoolClient) => typeof meta.payment_row_id === "string" && (await db.query("SELECT 1 FROM payments WHERE id=$1 AND booking_id=$2 AND status IN ('captured','partially_refunded') AND verified_at IS NOT NULL", [meta.payment_row_id, booking.id])).rowCount ? null : "No verified payment is recorded for this booking";

/** SPEC 10 state table. EXPIRED_PAID is a legacy state (payment after expiry) that can only be cancelled. */
const transitions: Record<BookingStatus, Partial<Record<BookingStatus, Guard>>> = {
  HELD: {
    PENDING: booking => holdLive(booking) ?? (booking.terms_accepted_at ? null : "Terms have not been accepted"),
    EXPIRED: holdOver
  },
  PENDING: {
    // Verified payment, an offline advance recorded by the vendor, or nothing to pay.
    CONFIRMED: (booking, meta, db) => Number(booking.advance_paise) === 0 ? null : paidBy(booking, meta, db),
    EXPIRED: async (booking, _meta, db) => holdOver(booking) ?? ((await db.query("SELECT 1 FROM payments WHERE booking_id=$1 AND status='captured'", [booking.id])).rowCount ? "A verified payment exists" : null),
    CANCELLED: hasReason
  },
  CONFIRMED: {
    COMPLETED: booking => booking.ends_at < new Date() ? null : "The booking has not ended yet",
    CANCELLED: hasReason
  },
  EXPIRED_PAID: { CANCELLED: hasReason },
  // A payment that lands after the hold expired (SPEC 11.4): re-claim the slot (the exclusion constraint is the guard), or park it for a refund.
  EXPIRED: { CONFIRMED: paidBy, EXPIRED_PAID: paidBy },
  COMPLETED: {}, CANCELLED: {}
};

/**
 * Locks the booking, checks the transition, updates the status and appends a booking_events row, all in the caller's
 * transaction. Throws AppError 404 (unknown booking) or 409 INVALID_TRANSITION.
 */
export async function transitionBooking(db: PoolClient, bookingId: string, to: BookingStatus, actor: string, reason: string, meta: Meta = {}) {
  const found = await db.query<Locked>("SELECT id,vendor_id,status,hold_expires_at,ends_at,advance_paise,terms_accepted_at FROM bookings WHERE id=$1 FOR UPDATE", [bookingId]);
  if (!found.rowCount) throw new AppError(404, "NOT_FOUND", "Booking not found");
  const booking = found.rows[0];
  const guard = transitions[booking.status][to];
  if (!guard) throw new AppError(409, "INVALID_TRANSITION", `A ${booking.status.toLowerCase()} booking cannot become ${to.toLowerCase()}`, { from: booking.status, to });
  const problem = await guard(booking, { ...meta, reason }, db);
  if (problem) throw new AppError(409, "INVALID_TRANSITION", problem, { from: booking.status, to });
  const updated = await db.query("UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *", [to, bookingId]);
  await db.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason,meta) VALUES($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), bookingId, booking.status, to, actor, reason, JSON.stringify(meta)]);
  return updated.rows[0] as Record<string, unknown> & { id: string; status: BookingStatus };
}

/** Records a new booking's first state ((none) -> status). Called right after the INSERT, in the same transaction. */
export async function recordCreated(db: PoolClient, bookingId: string, status: BookingStatus, actor: string, reason: string, meta: Meta = {}) {
  await db.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason,meta) VALUES($1,$2,NULL,$3,$4,$5,$6)", [randomUUID(), bookingId, status, actor, reason, JSON.stringify(meta)]);
}

/** An event that keeps the status (for example a reschedule): from_status = to_status, so the timeline shows it in order. */
export async function recordChange(db: PoolClient, bookingId: string, actor: string, reason: string, meta: Meta = {}) {
  const found = await db.query<{ status: BookingStatus }>("SELECT status FROM bookings WHERE id=$1", [bookingId]);
  await db.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason,meta) VALUES($1,$2,$3,$3,$4,$5,$6)", [randomUUID(), bookingId, found.rows[0].status, actor, reason, JSON.stringify(meta)]);
}

/** Per-vendor transaction lock (Neon/PgBouncer safe). Holds, manual bookings and time off all take it (SPEC 9.3). */
export async function lockVendorSchedule(db: PoolClient, vendorId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [vendorId]);
}

/** Lazy expiry (SPEC 10.2): moves overdue holds to EXPIRED through transitionBooking. One vendor, or all when vendorId is null. */
export async function expireOverdueHolds(db: PoolClient, vendorId: string | null) {
  const due = await db.query<{ id: string }>(`SELECT id FROM bookings WHERE status IN ('HELD','PENDING') AND hold_expires_at < now() ${vendorId ? "AND vendor_id=$1" : ""} ORDER BY id FOR UPDATE SKIP LOCKED`, vendorId ? [vendorId] : []);
  let expired = 0;
  for (const { id } of due.rows) {
    // A pending booking with a verified payment is left for payment reconciliation instead of being expired.
    const paid = await db.query("SELECT 1 FROM payments WHERE booking_id=$1 AND status='captured'", [id]);
    if (paid.rowCount) continue;
    await transitionBooking(db, id, "EXPIRED", "system", "hold expired");
    expired++;
  }
  return expired;
}
