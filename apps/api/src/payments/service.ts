import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { formatINR } from "@bayana/shared";
import { lockVendorSchedule, transitionBooking } from "../booking-transition.js";
import { pool, transaction } from "../database.js";
import { enqueueEmail } from "../email.js";
import { AppError } from "../errors.js";
import { log } from "../logger.js";
import type { ProviderPayment, ProviderRefund } from "./provider.js";
import { paymentProvider } from "./runtime.js";

// Money movement for one booking (SPEC 11). Every booking confirmation that follows a payment happens in the same transaction
// that records the verified payment row (PY-05). Amounts are integer paise.

type Db = Pool | PoolClient;
/** Short booking reference used as the Razorpay receipt (max 40 characters). */
export const bookingReference = (bookingId: string) => `bk_${bookingId.replace(/-/g, "").slice(0, 20)}`;
const OPEN = ["created", "failed", "authorized"];

/** Net paid = verified payments minus processed refunds, as SQL for any booking id expression. Balance due is total minus this (PY-07). */
export const paidSql = (bookingId: string) => `(COALESCE((SELECT SUM(amount_paise) FROM payments WHERE booking_id=${bookingId} AND status IN ('captured','refunded','partially_refunded') AND verified_at IS NOT NULL),0) - COALESCE((SELECT SUM(amount_paise) FROM refunds WHERE booking_id=${bookingId} AND status='processed'),0))`;
export async function paidPaise(db: Db, bookingId: string) {
  return Number((await db.query<{ paid: string }>(`SELECT ${paidSql("$1")} AS paid`, [bookingId])).rows[0].paid);
}
async function audit(db: Db, action: string, resourceId: string, metadata: Record<string, unknown>, actorUserId: string | null = null) {
  await db.query("INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,metadata) VALUES($1,$2,$3,'booking',$4,$5)", [randomUUID(), actorUserId, action, resourceId, JSON.stringify(metadata)]);
}

// ---- Orders -------------------------------------------------------------------------------------------------------

/** PY-02: the order amount is the booking's snapshotted advance; a repeated request reuses the open order. */
export async function createPaymentOrder(bookingId: string) {
  const provider = paymentProvider();
  return transaction(async db => {
    const found = await db.query<{ status: string; hold_expires_at: Date | null; advance_paise: string; total_paise: string }>("SELECT status,hold_expires_at,advance_paise,total_paise FROM bookings WHERE id=$1 FOR UPDATE", [bookingId]);
    if (!found.rowCount) throw new AppError(404, "NOT_FOUND", "Not found");
    const booking = found.rows[0];
    if (booking.status === "CONFIRMED" || booking.status === "COMPLETED") throw new AppError(409, "ALREADY_PAID", "This booking is already confirmed");
    if (booking.status === "HELD") throw new AppError(409, "TERMS_REQUIRED", "Agree to the terms before paying");
    if (booking.status !== "PENDING" || !booking.hold_expires_at || booking.hold_expires_at <= new Date()) throw new AppError(409, "HOLD_EXPIRED", "The hold has expired");
    const amount = Number(booking.advance_paise);
    if (amount <= 0) throw new AppError(409, "NOTHING_TO_PAY", "This booking needs no advance");
    const open = await db.query<{ provider_order_id: string; amount_paise: string; currency: string }>("SELECT provider_order_id,amount_paise,currency FROM payments WHERE booking_id=$1 AND kind='advance' AND provider='razorpay' AND status = ANY($2)", [bookingId, OPEN]);
    if (open.rowCount) return { order_id: open.rows[0].provider_order_id, key_id: provider.keyId, amount_paise: Number(open.rows[0].amount_paise), currency: open.rows[0].currency, reused: true };
    // The booking row lock above makes concurrent clicks wait here, so at most one order is created per booking.
    const order = await provider.createOrder({ amountPaise: amount, currency: "INR", receipt: bookingReference(bookingId), notes: { booking_id: bookingId } });
    if (order.amount !== amount || order.currency !== "INR") throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider returned an unexpected order");
    await db.query("INSERT INTO payments(id,booking_id,provider,provider_order_id,status,amount_paise,currency,kind) VALUES($1,$2,'razorpay',$3,'created',$4,'INR','advance')", [randomUUID(), bookingId, order.id, amount]);
    return { order_id: order.id, key_id: provider.keyId, amount_paise: amount, currency: "INR", reused: false };
  });
}

// ---- Checkout verification ----------------------------------------------------------------------------------------

/** PY-03: signature first (nothing is touched when it is wrong), then the gateway's own record of the payment. */
export async function verifyCheckout(bookingId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const provider = paymentProvider();
  if (!provider.verifyCheckoutSignature(input)) throw new AppError(400, "PAYMENT_SIGNATURE_INVALID", "The payment could not be verified");
  const stored = await pool.query("SELECT 1 FROM payments WHERE provider_order_id=$1 AND booking_id=$2", [input.orderId, bookingId]);
  if (!stored.rowCount) throw new AppError(400, "PAYMENT_ORDER_MISMATCH", "This payment does not belong to this booking");
  const payment = await provider.fetchPayment(input.paymentId);
  if (payment.order_id !== input.orderId) { await flagMismatch(bookingId, "checkout", payment, "order id differs"); throw new AppError(409, "PAYMENT_MISMATCH", "This payment does not match the booking"); }
  if (payment.status === "authorized") { await markOpenPayment(input.orderId, "authorized", payment); return { outcome: "authorized" as const }; }
  if (payment.status === "failed") { await markOpenPayment(input.orderId, "failed", payment); throw new AppError(402, "PAYMENT_FAILED", "The payment did not go through"); }
  if (payment.status !== "captured" && payment.status !== "refunded") return { outcome: "pending" as const };
  const result = await applyCapturedPayment(input.orderId, payment, "checkout");
  if (result.outcome === "mismatch") throw new AppError(409, "PAYMENT_MISMATCH", "This payment does not match the booking");
  return result;
}

async function flagMismatch(bookingId: string | null, source: string, payment: ProviderPayment, problem: string) {
  log("warn", "payment.mismatch", { bookingId, source, problem, providerPaymentId: payment.id, providerOrderId: payment.order_id });
  if (bookingId) await audit(pool, "payment.mismatch_review", bookingId, { source, problem, provider_payment_id: payment.id, provider_order_id: payment.order_id, amount: payment.amount, currency: payment.currency });
}

/** A failed or authorized-only attempt on an open order; a captured order is never moved back. */
export async function markOpenPayment(orderId: string, status: "failed" | "authorized", payment: ProviderPayment) {
  await pool.query("UPDATE payments SET status=$2,failure_reason=$3,raw=$4,updated_at=now() WHERE provider_order_id=$1 AND status = ANY($5)", [orderId, status, status === "failed" ? (payment.error_description ?? "Payment failed").slice(0, 500) : null, JSON.stringify(payment), OPEN]);
}

// ---- Capture ------------------------------------------------------------------------------------------------------

export type CaptureOutcome = { outcome: "confirmed" | "already" | "reclaimed" | "refund_pending" | "mismatch"; bookingId: string; refundIds?: string[]; problem?: string };
export class PaymentNotYetKnown extends Error { constructor(what: string) { super(`Waiting for ${what}`); this.name = "PaymentNotYetKnown"; } }

/**
 * Records a captured payment exactly once (the payments row is locked FOR UPDATE, so checkout and webhook serialise) and, in the
 * same transaction, confirms the booking, re-claims an expired slot, or parks it for an automatic full refund (SPEC 11.4).
 */
export async function applyCapturedPayment(orderId: string, payment: ProviderPayment, source: "checkout" | "webhook"): Promise<CaptureOutcome> {
  const result = await transaction(async (db): Promise<CaptureOutcome> => {
    const found = await db.query<{ id: string; booking_id: string; status: string; amount_paise: string; currency: string; provider_payment_id: string | null; booking_status: string; vendor_id: string; client_email: string; service_name: string; block_start: Date; block_end: Date }>(
      "SELECT p.id,p.booking_id,p.status,p.amount_paise,p.currency,p.provider_payment_id,b.status AS booking_status,b.vendor_id,b.client_email::text AS client_email,b.service_name,b.block_start,b.block_end FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.provider_order_id=$1 AND p.provider='razorpay' FOR UPDATE OF p", [orderId]);
    if (!found.rowCount) throw new PaymentNotYetKnown(`order ${orderId}`);
    const row = found.rows[0];
    const problem = payment.order_id !== orderId ? "order id differs" : payment.amount !== Number(row.amount_paise) ? "amount differs from the stored order" : payment.currency !== row.currency ? "currency differs from the stored order" : null;
    if (problem) return { outcome: "mismatch", bookingId: row.booking_id, problem };
    if (row.provider_payment_id) {
      if (row.provider_payment_id === payment.id) return { outcome: "already", bookingId: row.booking_id };
      return { outcome: "mismatch", bookingId: row.booking_id, problem: "a second payment arrived for an order that is already paid" };
    }
    await db.query("UPDATE payments SET status='captured',provider_payment_id=$2,verified_at=now(),method=$3,raw=$4,failure_reason=NULL,updated_at=now() WHERE id=$1", [row.id, payment.id, knownMethod(payment.method), JSON.stringify(payment)]);
    await db.query("INSERT INTO ledger_entries(id,booking_id,payment_id,kind,amount_paise,actor,reason,channel) VALUES($1,$2,$3,'PAYMENT',$4,$5,$6,'razorpay')", [randomUUID(), row.booking_id, row.id, -Number(row.amount_paise), source === "checkout" ? "razorpay-checkout" : "razorpay-webhook", "verified Razorpay payment"]);
    const meta = { payment_row_id: row.id, provider_payment_id: payment.id, source };
    if (row.booking_status === "PENDING") {
      await transitionBooking(db, row.booking_id, "CONFIRMED", "razorpay", `advance verified (${source})`, meta);
      await enqueueEmail(db, { bookingId: row.booking_id, to: row.client_email, subject: `Booking confirmed: ${row.service_name}`, text: `We received your advance of ${formatINR(Number(row.amount_paise))}. Your booking is confirmed.` });
      return { outcome: "confirmed", bookingId: row.booking_id };
    }
    if (row.booking_status === "EXPIRED") {
      // Late payment: re-claim through the normal guard (same vendor lock as holds, then the exclusion constraint).
      await lockVendorSchedule(db, row.vendor_id);
      const blocked = await db.query("SELECT 1 FROM blocked_periods WHERE vendor_id=$1 AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1", [row.vendor_id, row.block_start, row.block_end]);
      if (!blocked.rowCount) {
        await db.query("SAVEPOINT reclaim");
        try {
          await transitionBooking(db, row.booking_id, "CONFIRMED", "razorpay", "late payment, slot re-claimed", { ...meta, late: true });
          await db.query("RELEASE SAVEPOINT reclaim");
          await enqueueEmail(db, { bookingId: row.booking_id, to: row.client_email, subject: `Booking confirmed: ${row.service_name}`, text: `Your payment arrived after the hold ended, and the time was still free, so your booking is confirmed.` });
          return { outcome: "reclaimed", bookingId: row.booking_id };
        } catch (error) {
          if ((error as { code?: string }).code !== "23P01") throw error;
          await db.query("ROLLBACK TO SAVEPOINT reclaim");
        }
      }
      await transitionBooking(db, row.booking_id, "EXPIRED_PAID", "razorpay", "late payment, slot no longer free", meta);
    }
    // Late with the slot gone, or money for a booking that is no longer waiting for it: refund in full and flag for review.
    const refundIds = await createRefundRows(db, row.booking_id, Number(row.amount_paise), "Paid after the booking could no longer be held; refunded in full", [row.id]);
    await audit(db, "payment.auto_refund_review", row.booking_id, { provider_payment_id: payment.id, booking_status: row.booking_status, amount_paise: Number(row.amount_paise) });
    await enqueueEmail(db, { bookingId: row.booking_id, to: row.client_email, subject: "Your payment is being refunded", text: `Your payment of ${formatINR(Number(row.amount_paise))} reached us after the time was no longer available, so we are refunding it in full. Refunds usually reach you in 5 to 7 working days.` });
    return { outcome: "refund_pending", bookingId: row.booking_id, refundIds };
  });
  if (result.outcome === "mismatch") await flagMismatch(result.bookingId, source, payment, result.problem ?? "mismatch");
  for (const refundId of result.refundIds ?? []) await issueRefund(refundId);
  return result;
}
const knownMethod = (method: string | null) => method && ["card", "upi", "netbanking", "wallet"].includes(method) ? method : "other";

// ---- Offline payments (PY-10) ---------------------------------------------------------------------------------------

export async function recordOfflinePayment(input: { vendorId: string; userId: string; bookingId: string; kind: "advance" | "balance"; amountPaise: number; method: "cash" | "upi" | "bank_transfer" | "other"; note: string }) {
  return transaction(async db => {
    const found = await db.query<{ status: string; advance_paise: string; total_paise: string; client_email: string; service_name: string }>("SELECT status,advance_paise,total_paise,client_email::text AS client_email,service_name FROM bookings WHERE id=$1 AND vendor_id=$2 FOR UPDATE", [input.bookingId, input.vendorId]);
    if (!found.rowCount) throw new AppError(404, "NOT_FOUND", "Booking not found");
    const booking = found.rows[0];
    if (booking.status === "HELD") throw new AppError(409, "TERMS_REQUIRED", "The customer has not agreed to the terms yet");
    if (!["PENDING", "CONFIRMED", "COMPLETED"].includes(booking.status)) throw new AppError(409, "BOOKING_NOT_PAYABLE", "Payments can be recorded only for pending or confirmed bookings");
    const balance = Number(booking.total_paise) - await paidPaise(db, input.bookingId);
    if (input.amountPaise > balance) throw new AppError(400, "AMOUNT_EXCEEDS_BALANCE", `That is more than the balance due (${formatINR(balance)})`, { balance_due_paise: balance });
    const paymentId = randomUUID();
    await db.query("INSERT INTO payments(id,booking_id,provider,status,amount_paise,currency,kind,verified_at,method,note,recorded_by) VALUES($1,$2,'offline','captured',$3,'INR',$4,now(),$5,$6,$7)", [paymentId, input.bookingId, input.amountPaise, input.kind, input.method, input.note, input.userId]);
    await db.query("INSERT INTO ledger_entries(id,booking_id,payment_id,kind,amount_paise,actor,reason,channel) VALUES($1,$2,$3,'PAYMENT',$4,'vendor',$5,'offline')", [randomUUID(), input.bookingId, paymentId, -input.amountPaise, `offline ${input.kind} (${input.method}): ${input.note}`.slice(0, 500)]);
    await audit(db, "payment.offline_recorded", input.bookingId, { payment_id: paymentId, kind: input.kind, method: input.method, amount_paise: input.amountPaise, note: input.note }, input.userId);
    let confirmed = false;
    if (booking.status === "PENDING" && input.kind === "advance" && await paidPaise(db, input.bookingId) >= Number(booking.advance_paise)) {
      await transitionBooking(db, input.bookingId, "CONFIRMED", "vendor", "offline advance recorded", { payment_row_id: paymentId, offline: true });
      await audit(db, "booking.manual_confirmation", input.bookingId, { payment_id: paymentId }, input.userId);
      confirmed = true;
    }
    await enqueueEmail(db, { bookingId: input.bookingId, to: booking.client_email, subject: confirmed ? `Booking confirmed: ${booking.service_name}` : `Payment recorded: ${booking.service_name}`, text: `The business recorded your ${input.kind} payment of ${formatINR(input.amountPaise)}.${confirmed ? " Your booking is confirmed." : ""}` });
    return { payment_id: paymentId, confirmed };
  });
}

// ---- Refunds (PY-08) ----------------------------------------------------------------------------------------------

/**
 * Splits a refund across the booking's verified payments, newest online payment first. Online parts become pending rows that
 * issueRefund sends to the gateway after commit; offline parts are "manual" (the vendor returns that money directly).
 */
export async function createRefundRows(db: PoolClient, bookingId: string, amountPaise: number, reason: string, onlyPaymentIds?: string[]) {
  const payments = await db.query<{ id: string; provider: string; amount_paise: string; refunded: string }>(`SELECT p.id,p.provider,p.amount_paise,COALESCE((SELECT SUM(r.amount_paise) FROM refunds r WHERE r.payment_id=p.id AND r.status<>'failed'),0) AS refunded
    FROM payments p WHERE p.booking_id=$1 AND p.status IN ('captured','partially_refunded') AND p.verified_at IS NOT NULL ${onlyPaymentIds ? "AND p.id = ANY($2)" : ""} ORDER BY (p.provider='razorpay') DESC, p.created_at DESC`, onlyPaymentIds ? [bookingId, onlyPaymentIds] : [bookingId]);
  let left = amountPaise; const pending: string[] = [];
  for (const payment of payments.rows) {
    const share = Math.min(left, Number(payment.amount_paise) - Number(payment.refunded));
    if (share <= 0) continue;
    const id = randomUUID();
    await db.query("INSERT INTO refunds(id,payment_id,booking_id,amount_paise,status,reason) VALUES($1,$2,$3,$4,$5,$6)", [id, payment.id, bookingId, share, payment.provider === "razorpay" ? "pending" : "manual", reason.slice(0, 500)]);
    if (payment.provider === "razorpay") pending.push(id);
    left -= share;
    if (left === 0) break;
  }
  return pending;
}

/** Sends one pending refund to the gateway. Safe to call twice: the row lock and the provider id make the second call a no-op. */
export async function issueRefund(refundId: string) {
  await transaction(async db => {
    const found = await db.query<{ status: string; provider_refund_id: string | null; amount_paise: string; booking_id: string; provider_payment_id: string }>("SELECT r.status,r.provider_refund_id,r.amount_paise,r.booking_id,p.provider_payment_id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1 FOR UPDATE OF r", [refundId]);
    const refund = found.rows[0];
    if (!refund || refund.status !== "pending" || refund.provider_refund_id) return;
    // A savepoint keeps the transaction usable after a failure, so the failure itself is recorded.
    await db.query("SAVEPOINT issue_refund");
    try {
      const issued = await paymentProvider().createRefund({ paymentId: refund.provider_payment_id, amountPaise: Number(refund.amount_paise), notes: { booking_id: refund.booking_id, refund_id: refundId } });
      await db.query("UPDATE refunds SET provider_refund_id=$2 WHERE id=$1", [refundId, issued.id]);
      if (issued.status === "processed") await applyRefundProcessed(db, refundId);
      await db.query("RELEASE SAVEPOINT issue_refund");
    } catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT issue_refund");
      const message = error instanceof Error ? error.message : "Refund failed";
      await db.query("UPDATE refunds SET status='failed',error=$2 WHERE id=$1", [refundId, message.slice(0, 500)]);
      await audit(db, "refund.failed_review", refund.booking_id, { refund_id: refundId, error: message.slice(0, 200) });
      log("error", "refund.failed", { refundId, bookingId: refund.booking_id, err: message.slice(0, 200) });
    }
  });
}

/** Marks a refund processed once: ledger entry, payment status. Repeats (webhook after the API reply) change nothing. */
export async function applyRefundProcessed(db: PoolClient, refundId: string) {
  const updated = await db.query<{ payment_id: string; booking_id: string; amount_paise: string }>("UPDATE refunds SET status='processed',processed_at=now(),error=NULL WHERE id=$1 AND status<>'processed' RETURNING payment_id,booking_id,amount_paise", [refundId]);
  if (!updated.rowCount) return false;
  const refund = updated.rows[0];
  await db.query("INSERT INTO ledger_entries(id,booking_id,payment_id,refund_id,kind,amount_paise,actor,reason,channel) VALUES($1,$2,$3,$4,'REFUND',$5,'razorpay','refund processed','razorpay')", [randomUUID(), refund.booking_id, refund.payment_id, refundId, Number(refund.amount_paise)]);
  await db.query(`UPDATE payments p SET status = CASE WHEN (SELECT SUM(amount_paise) FROM refunds WHERE payment_id=p.id AND status='processed') >= p.amount_paise THEN 'refunded' ELSE 'partially_refunded' END, updated_at=now() WHERE p.id=$1`, [refund.payment_id]);
  return true;
}

/** refund.processed / refund.failed from the gateway, in any order relative to our own refund call. */
export async function applyProviderRefund(entity: ProviderRefund, status: "processed" | "failed") {
  await transaction(async db => {
    const payment = await db.query<{ id: string; booking_id: string }>("SELECT id,booking_id FROM payments WHERE provider_payment_id=$1", [entity.payment_id]);
    if (!payment.rowCount) throw new PaymentNotYetKnown(`payment ${entity.payment_id}`);
    let refund = await db.query<{ id: string }>("SELECT id FROM refunds WHERE provider_refund_id=$1 FOR UPDATE", [entity.id]);
    // Our own refund whose id we have not stored yet, or one made in the Razorpay dashboard.
    if (!refund.rowCount) refund = await db.query<{ id: string }>("UPDATE refunds SET provider_refund_id=$1 WHERE id=(SELECT id FROM refunds WHERE payment_id=$2 AND amount_paise=$3 AND provider_refund_id IS NULL AND status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE) RETURNING id", [entity.id, payment.rows[0].id, entity.amount]);
    if (!refund.rowCount) { const id = randomUUID(); await db.query("INSERT INTO refunds(id,payment_id,booking_id,amount_paise,status,provider_refund_id,reason) VALUES($1,$2,$3,$4,'pending',$5,'refund created at Razorpay')", [id, payment.rows[0].id, payment.rows[0].booking_id, entity.amount, entity.id]); refund = { rowCount: 1, rows: [{ id }] } as typeof refund; }
    const refundId = refund.rows[0].id;
    if (status === "processed") await applyRefundProcessed(db, refundId);
    else {
      const failed = await db.query("UPDATE refunds SET status='failed',error='Razorpay reported the refund failed' WHERE id=$1 AND status='pending' RETURNING id", [refundId]);
      if (failed.rowCount) await audit(db, "refund.failed_review", payment.rows[0].booking_id, { refund_id: refundId, provider_refund_id: entity.id });
    }
  });
}
