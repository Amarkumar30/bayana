import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { advancePaise } from "@bayana/shared";
import { config } from "./config.js";
import { slotsForDate } from "./availability.js";
import { expireOverdueHolds, lockVendorSchedule, recordCreated, transitionBooking } from "./booking-transition.js";
import { AppError } from "./errors.js";
import { loadSlotEngineInput } from "./slot-data.js";

export { transitionBooking } from "./booking-transition.js";

type HoldInput = { slug: string; date: string; name: string; email: string; clientUserId: string; phone?: string; notes?: string; referral?: string; serviceId: string; startsAt: string; termsAccepted: boolean; key: string };
type Service = { id: string; name: string; price_paise: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number; booking_mode: "TIMED" | "FULL_DAY"; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number; terms_template: string; cancellation_tiers: unknown };
const bookingView = "id,vendor_id,status,service_id,service_name,starts_at,ends_at,total_paise,advance_paise,hold_expires_at,payment_required,created_at";
const slotTaken = () => new AppError(409, "SLOT_TAKEN", "That time was just taken. Please choose another time.");

/**
 * Creates a hold (SPEC 9.3): vendor lock, lazy expiry, idempotency, slot re-check with the engine, insert (the exclusion
 * constraint is the last guard), events. Times, price and advance come from the server; the client only names a slot.
 */
export async function createHold(db: PoolClient, input: HoldInput) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ slug: input.slug, date: input.date, name: input.name, phone: input.phone ?? "", notes: input.notes ?? "", referral: input.referral ?? "", serviceId: input.serviceId, startsAt: input.startsAt, termsAccepted: input.termsAccepted, clientUserId: input.clientUserId })).digest("hex");
  const vendor = await db.query<{ id: string; phone_required: boolean; payment_required: boolean; owner_email: string | null; terms: string; cancellation_policy: string; rescheduling_policy: string }>("SELECT v.id,v.phone_required,v.payment_required,u.email::text AS owner_email,v.terms,v.cancellation_policy,v.rescheduling_policy FROM vendors v LEFT JOIN users u ON u.id=v.owner_user_id WHERE v.slug=$1 AND v.bookings_enabled AND v.published", [input.slug]);
  if (!vendor.rowCount) throw new AppError(404, "NOT_FOUND", "Vendor is unavailable");
  const p = vendor.rows[0];
  await lockVendorSchedule(db, p.id);
  const existing = await db.query(`SELECT ${bookingView},idempotency_fingerprint FROM bookings WHERE vendor_id=$1 AND idempotency_key=$2`, [p.id, input.key]);
  if (existing.rowCount) {
    if (existing.rows[0].idempotency_fingerprint !== fingerprint) throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with different booking details");
    const { idempotency_fingerprint: _fingerprint, ...replay } = existing.rows[0]; return replay;
  }
  if (!input.termsAccepted) throw new AppError(400, "TERMS_REQUIRED", "You must accept the vendor policies");
  if (p.phone_required && !input.phone) throw new AppError(400, "PHONE_REQUIRED", "Phone number is required by this vendor");
  await expireOverdueHolds(db, p.id);
  const serviceResult = await db.query<Service>("SELECT id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,advance_type,advance_value,terms_template,cancellation_tiers FROM services WHERE id=$1 AND vendor_id=$2 AND active", [input.serviceId, p.id]);
  if (!serviceResult.rowCount) throw new AppError(409, "SERVICE_UNAVAILABLE", "Service unavailable");
  const service = serviceResult.rows[0];
  const engine = await loadSlotEngineInput(db, p.id, service.id);
  const slot = engine ? slotsForDate(input.date, engine).find(value => value.startsAt === input.startsAt) : undefined;
  if (!slot) throw slotTaken();
  const total = Number(service.price_paise), advance = advancePaise(total, service.advance_type, service.advance_value);
  if (advance > 0 && advance < config.MIN_ADVANCE_PAISE) throw new AppError(400, "INVALID_ADVANCE", "Invalid advance rule");
  // Without online payments the booking waits (PENDING) for the vendor to record an offline advance.
  const awaitsOffline = advance > 0 && config.PAYMENT_MODE === "disabled";
  const expires = new Date(Date.now() + (awaitsOffline ? config.REQUEST_HOLD_HOURS * 3_600_000 : config.HOLD_MINUTES * 60_000));
  const id = randomUUID(), accessToken = randomBytes(32).toString("base64url"), accessHash = createHash("sha256").update(`${config.SESSION_SECRET}:booking:${accessToken}`).digest("hex");
  const snapshot = { vendor: { terms: p.terms, cancellation_policy: p.cancellation_policy, rescheduling_policy: p.rescheduling_policy }, terms_template: service.terms_template, cancellation_tiers: service.cancellation_tiers };
  try {
    await db.query("INSERT INTO bookings(id,vendor_id,client_user_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,idempotency_fingerprint,access_token_hash,service_id,service_name,duration_minutes,local_start_time,starts_at,ends_at,block_start,block_end,customer_notes,referral,terms_accepted_at,payment_required,service_price_paise,service_advance_type,service_advance_value,buffer_before_minutes,buffer_after_minutes,terms_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,'HELD',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now(),$24,$25,$26,$27,$28,$29,$30)", [id,p.id,input.clientUserId,input.date,input.name,input.email,input.phone ?? "",total,advance,expires,input.key,fingerprint,accessHash,service.id,service.name,service.duration_minutes,input.startsAt.slice(11, 16),slot.startsAt,slot.endsAt,slot.occupiedStartsAt,slot.occupiedEndsAt,input.notes ?? null,input.referral ?? null,p.payment_required,total,service.advance_type,service.advance_value,service.buffer_before_minutes,service.buffer_after_minutes,JSON.stringify(snapshot)]);
  } catch (error) {
    // 23P01: the exclusion constraint caught an overlap the engine check could not see (SPEC 8.3).
    if ((error as { code?: string }).code === "23P01") throw slotTaken();
    throw error;
  }
  await recordCreated(db, id, "HELD", "client", "slot held");
  let booking: Record<string, unknown> & { status: string } = { status: "HELD" };
  if (advance === 0 || awaitsOffline) booking = await transitionBooking(db, id, "PENDING", "client", advance === 0 ? "terms accepted, nothing to pay" : "terms accepted, advance to be arranged offline");
  if (advance === 0) booking = await transitionBooking(db, id, "CONFIRMED", "system", "no advance required");
  const status = booking.status;
  const message = status === "CONFIRMED" ? "Your booking is confirmed." : status === "PENDING" ? "Request received, advance to be arranged." : "Your booking is held while payment is arranged.";
  // The first WEB_ORIGINS entry is the canonical public site used in emailed links.
  const link = `${config.WEB_ORIGINS[0]}/booking/${id}?t=${accessToken}`;
  await db.query("INSERT INTO email_outbox(id,booking_id,recipient,subject,text_body) VALUES($1,$2,$3,$4,$5)", [randomUUID(),id,input.email,`Booking ${status.toLowerCase()}`,`${message}\nView booking: ${link}`]);
  if (p.owner_email) await db.query("INSERT INTO email_outbox(id,booking_id,recipient,subject,text_body) VALUES($1,$2,$3,$4,$5)", [randomUUID(),id,p.owner_email,"New booking request",`${input.name} booked ${service.name}.`]);
  return (await db.query(`SELECT ${bookingView} FROM bookings WHERE id=$1`, [id])).rows[0];
}

/** Tick expiry (SPEC 10.2): every vendor's overdue holds, safe to run late or twice. */
export async function sweepExpiredBookings(db: PoolClient) {
  return expireOverdueHolds(db, null);
}
