import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { localDateTimeToUtc } from "@bayana/shared";
import { writeAudit } from "./audit.js";
import { tokenHash } from "./booking-routes.js";
import { expireOverdueHolds, lockVendorSchedule, recordChange, recordCreated, transitionBooking } from "./booking-transition.js";
import { transaction } from "./database.js";
import { AppError } from "./errors.js";
import { notifyCancelled, notifyConfirmed, notifyRescheduled } from "./notifications/booking-mail.js";
import { createRefundRows, issueRefund, paidPaise } from "./payments/service.js";

// Vendor actions on their own bookings (SPEC 4.4 BK-09, BK-11, BK-12, BK-13). Every status change goes through
// transitionBooking; every change of time takes the vendor schedule lock, and the exclusion constraint is the last guard.

type Actor = { vendorId: string; userId: string };
const notFound = () => new AppError(404, "NOT_FOUND", "Booking not found");
const slotTaken = () => new AppError(409, "SLOT_TAKEN", "That time overlaps another booking. Choose another time.");

/** Locks one of the vendor's own bookings; any other id (another vendor's, or unknown) is the same 404. */
async function ownBooking(db: PoolClient, actor: Actor, bookingId: string) {
  const found = await db.query<{ id: string; status: string; starts_at: Date; ends_at: Date; block_start: Date; block_end: Date; service_id: string | null; timezone: string }>(
    "SELECT b.id,b.status,b.starts_at,b.ends_at,b.block_start,b.block_end,b.service_id,v.timezone FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1 AND b.vendor_id=$2 FOR UPDATE OF b", [bookingId, actor.vendorId]);
  if (!found.rowCount) throw notFound();
  return found.rows[0];
}

type Times = { startsAt: Date; endsAt: Date; blockStart: Date; blockEnd: Date };
/**
 * Server-side times for a local date and time in the vendor's timezone: TIMED services keep their duration and buffers,
 * FULL_DAY services take the whole local day. The time must be in the future and outside the vendor's time off.
 */
async function placeTimes(db: PoolClient, vendorId: string, timezone: string, date: string, time: string, shape: { fullDay: boolean; durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number }): Promise<Times> {
  const nextDay = new Date(`${date}T12:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const startsAt = localDateTimeToUtc(`${date}T${shape.fullDay ? "00:00" : time}:00`, timezone);
  const endsAt = shape.fullDay ? localDateTimeToUtc(`${nextDay.toISOString().slice(0, 10)}T00:00:00`, timezone) : startsAt && new Date(startsAt.getTime() + shape.durationMinutes * 60_000);
  if (!startsAt || !endsAt) throw new AppError(400, "INVALID_TIME", "That local time does not exist (a clock change). Choose another time.");
  if (startsAt <= new Date()) throw new AppError(400, "TIME_IN_PAST", "Choose a time in the future.");
  const blockStart = new Date(startsAt.getTime() - (shape.fullDay ? 0 : shape.bufferBeforeMinutes) * 60_000), blockEnd = new Date(endsAt.getTime() + (shape.fullDay ? 0 : shape.bufferAfterMinutes) * 60_000);
  const off = await db.query("SELECT 1 FROM blocked_periods WHERE vendor_id=$1 AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1", [vendorId, blockStart, blockEnd]);
  if (off.rowCount) throw new AppError(409, "BOOKING_CONFLICT", "That time is in a period you blocked off. Remove the time off first or choose another time.");
  return { startsAt, endsAt, blockStart, blockEnd };
}

/** BK-11: the vendor cancels with a reason; the customer gets back everything paid and an email. */
export async function vendorCancel(actor: Actor, bookingId: string, reason: string) {
  const pending = await transaction(async db => {
    await ownBooking(db, actor, bookingId);
    const paid = await paidPaise(db, bookingId);
    await transitionBooking(db, bookingId, "CANCELLED", "vendor", reason, { refund_paise: paid, refund_percent: 100, paid_paise: paid, by_user: actor.userId });
    const online = paid > 0 ? await createRefundRows(db, bookingId, paid, `Cancelled by the business: full refund. Reason: ${reason}`) : [];
    const manual = (await db.query<{ total: string }>("SELECT COALESCE(SUM(amount_paise),0) AS total FROM refunds WHERE booking_id=$1 AND status='manual'", [bookingId])).rows[0].total;
    await notifyCancelled(db, bookingId, { cancelledBy: "vendor", reason, refundPaise: paid, refundManual: paid > 0 && online.length === 0 });
    await writeAudit(db, actor.userId, "booking.vendor_cancelled", "booking", bookingId, { reason, refund_paise: paid, manual_refund_paise: Number(manual) });
    return online;
  });
  for (const refundId of pending) await issueRefund(refundId);
}

/** BK-12: only a confirmed booking that has ended (the transition guard checks both). */
export async function vendorComplete(actor: Actor, bookingId: string) {
  await transaction(async db => {
    await ownBooking(db, actor, bookingId);
    await transitionBooking(db, bookingId, "COMPLETED", "vendor", "marked completed", { by_user: actor.userId });
  });
}

/**
 * BK-09: moves an active booking to another time. Payments and the agreed terms stay. The update either fully succeeds or,
 * when the new time overlaps another booking (exclusion constraint) or time off, nothing changes.
 */
export async function vendorReschedule(actor: Actor, bookingId: string, date: string, time: string) {
  await transaction(async db => {
    // Same order as hold creation: schedule lock, lazy expiry, then the row.
    await lockVendorSchedule(db, actor.vendorId);
    await expireOverdueHolds(db, actor.vendorId);
    const booking = await ownBooking(db, actor, bookingId);
    if (!["PENDING", "CONFIRMED"].includes(booking.status)) throw new AppError(409, "INVALID_TRANSITION", "Only pending or confirmed bookings can be moved.");
    if (booking.starts_at <= new Date()) throw new AppError(409, "INVALID_TRANSITION", "This booking has already started, so it cannot be moved.");
    const mode = booking.service_id ? (await db.query<{ booking_mode: string }>("SELECT booking_mode FROM services WHERE id=$1", [booking.service_id])).rows[0]?.booking_mode : undefined;
    const minutes = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);
    const times = await placeTimes(db, actor.vendorId, booking.timezone, date, time, { fullDay: mode === "FULL_DAY", durationMinutes: minutes(booking.starts_at, booking.ends_at), bufferBeforeMinutes: minutes(booking.block_start, booking.starts_at), bufferAfterMinutes: minutes(booking.ends_at, booking.block_end) });
    try {
      // A moved booking gets a fresh 24-hour reminder for its new time.
      await db.query("UPDATE bookings SET starts_at=$2,ends_at=$3,block_start=$4,block_end=$5,event_date=$6,local_start_time=$7,reminder_sent_at=NULL WHERE id=$1", [bookingId, times.startsAt, times.endsAt, times.blockStart, times.blockEnd, date, mode === "FULL_DAY" ? null : time]);
    } catch (error) {
      if ((error as { code?: string }).code === "23P01") throw slotTaken();
      throw error;
    }
    await recordChange(db, bookingId, "vendor", "rescheduled", { from_starts_at: booking.starts_at.toISOString(), to_starts_at: times.startsAt.toISOString(), by_user: actor.userId });
    await writeAudit(db, actor.userId, "booking.rescheduled", "booking", bookingId, { from_starts_at: booking.starts_at.toISOString(), to_starts_at: times.startsAt.toISOString() });
    await notifyRescheduled(db, bookingId, booking.starts_at);
  });
}

type ManualInput = { serviceId: string; date: string; time: string; name: string; email: string; phone: string; notes: string; key: string };
/**
 * BK-13: a walk-in or phone booking. Same lock, same exclusion constraint, so it blocks the slot for customers at once.
 * No advance is asked online (advance 0, snapshotted price); the vendor records any money received on the booking page.
 * The vendor may book outside their published hours, but never over another booking or their own time off.
 */
export async function vendorManualBooking(actor: Actor, input: ManualInput) {
  return transaction(async db => {
    await lockVendorSchedule(db, actor.vendorId);
    const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, key: undefined, vendor: actor.vendorId })).digest("hex");
    const existing = await db.query<{ id: string; idempotency_fingerprint: string }>("SELECT id,idempotency_fingerprint FROM bookings WHERE vendor_id=$1 AND idempotency_key=$2", [actor.vendorId, input.key]);
    if (existing.rowCount) {
      if (existing.rows[0].idempotency_fingerprint !== fingerprint) throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This request was already sent with different details. Start again.");
      return { id: existing.rows[0].id, replayed: true };
    }
    await expireOverdueHolds(db, actor.vendorId);
    const found = await db.query<{ name: string; price_paise: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number; booking_mode: string; advance_type: string; advance_value: number; terms_template: string; cancellation_tiers: unknown; timezone: string; terms: string; cancellation_policy: string; rescheduling_policy: string }>(
      "SELECT s.name,s.price_paise,s.duration_minutes,s.buffer_before_minutes,s.buffer_after_minutes,s.booking_mode,s.advance_type,s.advance_value,s.terms_template,s.cancellation_tiers,v.timezone,v.terms,v.cancellation_policy,v.rescheduling_policy FROM services s JOIN vendors v ON v.id=s.vendor_id WHERE s.id=$1 AND s.vendor_id=$2", [input.serviceId, actor.vendorId]);
    if (!found.rowCount) throw new AppError(404, "NOT_FOUND", "Service not found");
    const service = found.rows[0];
    const times = await placeTimes(db, actor.vendorId, service.timezone, input.date, input.time, { fullDay: service.booking_mode === "FULL_DAY", durationMinutes: service.duration_minutes, bufferBeforeMinutes: service.buffer_before_minutes, bufferAfterMinutes: service.buffer_after_minutes });
    const id = randomUUID(), token = randomBytes(32).toString("base64url");
    const snapshot = { vendor: { terms: service.terms, cancellation_policy: service.cancellation_policy, rescheduling_policy: service.rescheduling_policy }, terms_template: service.terms_template, cancellation_tiers: service.cancellation_tiers };
    try {
      await db.query(`INSERT INTO bookings(id,vendor_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,idempotency_fingerprint,access_token_hash,service_id,service_name,duration_minutes,local_start_time,starts_at,ends_at,block_start,block_end,customer_notes,payment_required,service_price_paise,service_advance_type,service_advance_value,buffer_before_minutes,buffer_after_minutes,terms_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7,0,NULL,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,false,$7,$20,$21,$22,$23,$24)`,
        [id, actor.vendorId, input.date, input.name, input.email, input.phone, Number(service.price_paise), input.key, fingerprint, tokenHash(token), input.serviceId, service.name, service.duration_minutes, service.booking_mode === "FULL_DAY" ? null : input.time, times.startsAt, times.endsAt, times.blockStart, times.blockEnd, input.notes || null, service.advance_type, service.advance_value, service.buffer_before_minutes, service.buffer_after_minutes, JSON.stringify(snapshot)]);
    } catch (error) {
      if ((error as { code?: string }).code === "23P01") throw slotTaken();
      throw error;
    }
    await recordCreated(db, id, "PENDING", "vendor", "manual booking", { by_user: actor.userId });
    await transitionBooking(db, id, "CONFIRMED", "vendor", "manual booking, no online advance", { by_user: actor.userId });
    await writeAudit(db, actor.userId, "booking.manual_created", "booking", id, { service_id: input.serviceId, starts_at: times.startsAt.toISOString() });
    await notifyConfirmed(db, id, token);
    return { id, replayed: false };
  });
}
