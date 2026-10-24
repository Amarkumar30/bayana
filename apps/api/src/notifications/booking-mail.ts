import type { Pool, PoolClient } from "pg";
import { tiersInWords, type NotifyPrefs } from "@bayana/shared";
import { config } from "../config.js";
import { parseSnapshot } from "../contract.js";
import { log } from "../logger.js";
import { enqueue, PRIORITY } from "./outbox.js";

// Which emails a booking event sends, built from the booking row inside the caller's transaction.

type Db = Pool | PoolClient;
export const bookingUrl = (bookingId: string, token?: string) => `${config.WEB_ORIGINS[0]}/b/${bookingId}${token ? `?t=${encodeURIComponent(token)}` : ""}`;

export async function bookingFacts(db: Db, bookingId: string) {
  const row = (await db.query<{ client_name: string; client_email: string; service_name: string | null; starts_at: Date; total_paise: string; advance_paise: string; terms_snapshot: string | null; display_name: string; timezone: string; place: string | null; owner_email: string | null; paid: string; notify_prefs: Partial<NotifyPrefs> }>(
    `SELECT b.client_name,b.client_email::text AS client_email,b.service_name,b.starts_at,b.total_paise,b.advance_paise,b.terms_snapshot,v.display_name,v.timezone,COALESCE(v.service_area,v.city) AS place,u.email::text AS owner_email,v.notify_prefs,
       COALESCE((SELECT SUM(amount_paise) FROM payments WHERE booking_id=b.id AND status IN ('captured','refunded','partially_refunded') AND verified_at IS NOT NULL),0) - COALESCE((SELECT SUM(amount_paise) FROM refunds WHERE booking_id=b.id AND status='processed'),0) AS paid
     FROM bookings b JOIN vendors v ON v.id=b.vendor_id LEFT JOIN users u ON u.id=v.owner_user_id WHERE b.id=$1`, [bookingId])).rows[0];
  return {
    facts: { businessName: row.display_name, customerName: row.client_name, service: row.service_name ?? "Booking", startsAt: row.starts_at, timezone: row.timezone, totalPaise: Number(row.total_paise), advancePaise: Number(row.advance_paise), paidPaise: Number(row.paid), link: bookingUrl(bookingId) },
    customerEmail: row.client_email, vendorEmail: row.owner_email,
    /** The vendor's own copy of an email, or null when they turned that email off in Settings (SPEC 5.3). */
    vendorEmailFor: (kind: keyof NotifyPrefs) => row.notify_prefs[kind] === false ? null : row.owner_email, place: row.place ?? "", cancellation: tiersInWords(parseSnapshot(row.terms_snapshot).cancellation_tiers)
  };
}

/** booking_confirmed to the customer and the vendor, once each per booking. A manual booking passes the customer's private link token. */
export async function notifyConfirmed(db: Db, bookingId: string, customerToken?: string) {
  const booking = await bookingFacts(db, bookingId);
  await enqueue(db, "booking_confirmed_customer", booking.customerEmail, { ...booking.facts, link: bookingUrl(bookingId, customerToken), cancellation: booking.cancellation }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `confirmed:${bookingId}:customer`, senderName: booking.facts.businessName });
  const vendorEmail = booking.vendorEmailFor("booking_confirmed");
  if (vendorEmail) await enqueue(db, "booking_confirmed_vendor", vendorEmail, { ...booking.facts, customerEmail: booking.customerEmail }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `confirmed:${bookingId}:vendor` });
}

/** The customer agreed but pays offline: tell the vendor to collect and record the advance. */
export async function notifyRequestToVendor(db: Db, bookingId: string) {
  const booking = await bookingFacts(db, bookingId);
  if (booking.vendorEmail) await enqueue(db, "booking_request_vendor", booking.vendorEmail, { ...booking.facts, customerEmail: booking.customerEmail }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `request:${bookingId}:vendor` });
}

export async function notifyCancelled(db: Db, bookingId: string, details: { cancelledBy: "customer" | "vendor"; reason: string; refundPaise: number; refundManual: boolean }) {
  const booking = await bookingFacts(db, bookingId);
  for (const audience of ["customer", "vendor"] as const) {
    const to = audience === "customer" ? booking.customerEmail : booking.vendorEmailFor("booking_cancelled");
    if (to) await enqueue(db, "booking_cancelled", to, { ...booking.facts, ...details, audience }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `cancelled:${bookingId}:${audience}`, senderName: audience === "customer" ? booking.facts.businessName : undefined });
  }
}

export async function notifyRefundIssued(db: Db, refundId: string) {
  const refund = (await db.query<{ booking_id: string; amount_paise: string }>("SELECT booking_id,amount_paise FROM refunds WHERE id=$1", [refundId])).rows[0];
  if (!refund) return;
  const booking = await bookingFacts(db, refund.booking_id);
  await enqueue(db, "refund_issued", booking.customerEmail, { businessName: booking.facts.businessName, customerName: booking.facts.customerName, amountPaise: Number(refund.amount_paise), service: booking.facts.service, link: booking.facts.link }, { bookingId: refund.booking_id, priority: PRIORITY.urgent, dedupeKey: `refund:${refundId}`, senderName: booking.facts.businessName });
}

/** A vendor moved the booking: the customer hears about the new time (BK-09). */
export async function notifyRescheduled(db: Db, bookingId: string, previousStartsAt: Date) {
  const booking = await bookingFacts(db, bookingId);
  await enqueue(db, "booking_rescheduled", booking.customerEmail, { ...booking.facts, previousStartsAt }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `rescheduled:${bookingId}:${booking.facts.startsAt instanceof Date ? booking.facts.startsAt.toISOString() : String(booking.facts.startsAt)}`, senderName: booking.facts.businessName });
}

/** Something a person must look at. Goes to OPS_EMAIL; without one it is only logged (the audit rows remain). */
export async function notifyReview(db: Db, problem: string, bookingId: string | null, lines: string[], dedupeKey: string) {
  if (!config.OPS_EMAIL) { log("warn", "review.no_ops_email", { problem, bookingId }); return; }
  await enqueue(db, "payment_review", config.OPS_EMAIL, { problem, bookingId, lines: lines.slice(0, 50) }, { bookingId, priority: PRIORITY.urgent, dedupeKey: `review:${dedupeKey}` });
}
