import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { advancePaise, dailyTotalPaise } from "@bayana/shared";
import { config } from "./config.js";
import { dailyRange, slotsForDate } from "./availability.js";
import { expireOverdueHolds, lockVendorSchedule, recordCreated, transitionBooking } from "./booking-transition.js";
import { recordConsent } from "./consent.js";
import { loadContract } from "./contract.js";
import { paymentsEnabled } from "./payments/runtime.js";
import { bookingFacts, bookingUrl, notifyConfirmed, notifyRequestToVendor } from "./notifications/booking-mail.js";
import { enqueue, PRIORITY } from "./notifications/outbox.js";
import { AppError } from "./errors.js";
import { loadSlotEngineInput } from "./slot-data.js";

export { transitionBooking } from "./booking-transition.js";

type HoldInput = { slug: string; date: string; name: string; email: string; clientUserId: string; phone?: string; notes?: string; referral?: string; serviceId: string; startsAt?: string; days?: number; key: string };
type Service = { id: string; name: string; price_paise: string; duration_minutes: number | null; buffer_before_minutes: number | null; buffer_after_minutes: number | null; booking_mode: "hourly" | "daily"; min_days: number | null; max_days: number | null; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number; terms_template: string; cancellation_tiers: unknown };
const bookingView = "id,vendor_id,status,service_id,service_name,starts_at,ends_at,total_paise,advance_paise,hold_expires_at,payment_required,created_at";
const slotTaken = (daily = false) => new AppError(409, "SLOT_TAKEN", daily ? "Those dates are no longer free. Please choose other dates." : "That time was just taken. Please choose another time.");

/**
 * Creates a hold (SPEC 9.3): vendor lock, lazy expiry, idempotency, slot re-check with the engine, insert (the exclusion
 * constraint is the last guard), events. Times, price and advance come from the server; the client only names a slot (hourly)
 * or a start date and a number of days (daily). Which of the two applies is the service's stored mode, never the client's say.
 */
export async function createHold(db: PoolClient, input: HoldInput) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ slug: input.slug, date: input.date, name: input.name, phone: input.phone ?? "", notes: input.notes ?? "", referral: input.referral ?? "", serviceId: input.serviceId, startsAt: input.startsAt, clientUserId: input.clientUserId, ...(input.days === undefined ? {} : { days: input.days }) })).digest("hex");
  const vendor = await db.query<{ id: string; phone_required: boolean; payment_required: boolean; owner_email: string | null; terms: string; cancellation_policy: string; rescheduling_policy: string }>("SELECT v.id,v.phone_required,v.payment_required,u.email::text AS owner_email,v.terms,v.cancellation_policy,v.rescheduling_policy FROM vendors v LEFT JOIN users u ON u.id=v.owner_user_id WHERE v.slug=$1 AND v.bookings_enabled AND v.published", [input.slug]);
  if (!vendor.rowCount) throw new AppError(404, "NOT_FOUND", "Vendor is unavailable");
  const p = vendor.rows[0];
  await lockVendorSchedule(db, p.id);
  const existing = await db.query(`SELECT ${bookingView},idempotency_fingerprint FROM bookings WHERE vendor_id=$1 AND idempotency_key=$2`, [p.id, input.key]);
  if (existing.rowCount) {
    if (existing.rows[0].idempotency_fingerprint !== fingerprint) throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with different booking details");
    const { idempotency_fingerprint: _fingerprint, ...replay } = existing.rows[0]; return replay;
  }
  if (p.phone_required && !input.phone) throw new AppError(400, "PHONE_REQUIRED", "Phone number is required by this vendor");
  await expireOverdueHolds(db, p.id);
  const serviceResult = await db.query<Service>("SELECT id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,advance_type,advance_value,terms_template,cancellation_tiers FROM services WHERE id=$1 AND vendor_id=$2 AND active", [input.serviceId, p.id]);
  if (!serviceResult.rowCount) throw new AppError(409, "SERVICE_UNAVAILABLE", "Service unavailable");
  const service = serviceResult.rows[0];
  const daily = service.booking_mode === "daily";
  if (daily && input.startsAt !== undefined) throw new AppError(400, "DAILY_SERVICE", "This service is booked by the day. Choose a start date and a number of days, not a time.");
  if (!daily && input.days !== undefined) throw new AppError(400, "HOURLY_SERVICE", "This service is booked by the hour. Choose a time, not a number of days.");
  if (daily && input.days === undefined) throw new AppError(400, "DAYS_REQUIRED", "Choose how many days you need.");
  if (!daily && input.startsAt === undefined) throw new AppError(400, "TIME_REQUIRED", "Choose a time.");
  const days = input.days ?? 0, minDays = service.min_days ?? 1, maxDays = service.max_days ?? 1;
  if (daily && (days < minDays || days > maxDays)) throw new AppError(400, "INVALID_DAYS", minDays === maxDays ? `This service is booked for exactly ${minDays} ${minDays === 1 ? "day" : "days"}.` : `Choose between ${minDays} and ${maxDays} days.`, { min_days: minDays, max_days: maxDays });
  const engine = await loadSlotEngineInput(db, p.id, service.id);
  // Daily: every day of [date, date+days) must be open and free, and the buffer days free of bookings (dailyRange).
  const slot = !engine ? undefined : daily ? dailyRange(input.date, days, engine) ?? undefined : slotsForDate(input.date, engine).find(value => value.startsAt === input.startsAt);
  if (!slot || !engine) throw slotTaken(daily);
  const total = daily ? dailyTotalPaise(Number(service.price_paise), days) : Number(service.price_paise), advance = advancePaise(total, service.advance_type, service.advance_value);
  if (advance > 0 && advance < config.MIN_ADVANCE_PAISE) throw new AppError(400, "INVALID_ADVANCE", "Invalid advance rule");
  const expires = new Date(Date.now() + config.HOLD_MINUTES * 60_000);
  const id = randomUUID(), accessToken = randomBytes(32).toString("base64url"), accessHash = createHash("sha256").update(`${config.SESSION_SECRET}:booking:${accessToken}`).digest("hex");
  const snapshot = { vendor: { terms: p.terms, cancellation_policy: p.cancellation_policy, rescheduling_policy: p.rescheduling_policy }, terms_template: service.terms_template, cancellation_tiers: service.cancellation_tiers };
  try {
    await db.query("INSERT INTO bookings(id,vendor_id,client_user_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,idempotency_fingerprint,access_token_hash,service_id,service_name,duration_minutes,local_start_time,starts_at,ends_at,block_start,block_end,customer_notes,referral,terms_accepted_at,payment_required,service_price_paise,service_advance_type,service_advance_value,buffer_before_minutes,buffer_after_minutes,terms_snapshot,booking_mode,days_count,vendor_timezone) VALUES($1,$2,$3,$4,$5,$6,$7,'HELD',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NULL,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)", [id,p.id,input.clientUserId,input.date,input.name,input.email,input.phone ?? "",total,advance,expires,input.key,fingerprint,accessHash,service.id,service.name,service.duration_minutes,daily ? null : input.startsAt!.slice(11, 16),slot.startsAt,slot.endsAt,slot.occupiedStartsAt,slot.occupiedEndsAt,input.notes ?? null,input.referral ?? null,p.payment_required,Number(service.price_paise),service.advance_type,service.advance_value,service.buffer_before_minutes,service.buffer_after_minutes,JSON.stringify(snapshot),service.booking_mode,daily ? days : null,engine.timezone]);
  } catch (error) {
    // 23P01: the exclusion constraint caught an overlap the engine check could not see (SPEC 8.3).
    if ((error as { code?: string }).code === "23P01") throw slotTaken(daily);
    throw error;
  }
  await recordCreated(db, id, "HELD", "client", "slot held");
  // The first WEB_ORIGINS entry is the canonical public site used in emailed links.
  const { facts } = await bookingFacts(db, id);
  await enqueue(db, "hold_started", input.email, { ...facts, link: bookingUrl(id, accessToken), holdUntil: expires, online: paymentsEnabled() }, { bookingId: id, priority: PRIORITY.urgent, dedupeKey: `hold:${id}`, senderName: facts.businessName });
  // The raw token is returned once, to the customer who created the hold; only its hash is stored.
  return { ...(await db.query(`SELECT ${bookingView} FROM bookings WHERE id=$1`, [id])).rows[0], access_token: accessToken };
}

type Acceptance = { bookingId: string; termsHash: string; email: string; ip: string; userAgent: string };
/**
 * Click-wrap acceptance (SPEC 5.5 step 5, 11.5): the customer agrees to the exact text they were shown (same SHA-256), the
 * text and evidence are frozen, and the hold moves on to PENDING (and CONFIRMED when there is nothing to pay).
 */
export async function acceptTerms(db: PoolClient, input: Acceptance) {
  const found = await db.query<{ status: string; hold_expires_at: Date | null; advance_paise: string; client_email: string; client_name: string; service_name: string; owner_email: string | null }>("SELECT b.status,b.hold_expires_at,b.advance_paise,b.client_email::text AS client_email,b.client_name,b.service_name,u.email::text AS owner_email FROM bookings b JOIN vendors v ON v.id=b.vendor_id LEFT JOIN users u ON u.id=v.owner_user_id WHERE b.id=$1 FOR UPDATE OF b", [input.bookingId]);
  if (!found.rowCount) throw new AppError(404, "NOT_FOUND", "Not found");
  const booking = found.rows[0];
  const signed = await db.query<{ sha256: string }>("SELECT sha256 FROM booking_contracts WHERE booking_id=$1", [input.bookingId]);
  // A repeated click after success returns the current state instead of failing.
  if (signed.rowCount && signed.rows[0].sha256 === input.termsHash) return { booking: await bookingRow(db, input.bookingId) };
  if (booking.status === "EXPIRED" || booking.status === "HELD" && (!booking.hold_expires_at || booking.hold_expires_at <= new Date())) throw new AppError(409, "HOLD_EXPIRED", "Your hold has expired");
  if (booking.status !== "HELD") throw new AppError(409, "INVALID_TRANSITION", "This booking has already moved on");
  const contract = await loadContract(db, input.bookingId);
  if (!contract || contract.sha256 !== input.termsHash) throw new AppError(409, "TERMS_CHANGED", "The terms changed; review them again", { sha256: contract?.sha256 ?? null });
  await db.query("INSERT INTO booking_contracts(booking_id,body,sha256,accepted_email,ip,user_agent) VALUES($1,$2,$3,$4,$5,$6)", [input.bookingId, contract.text, contract.sha256, input.email, input.ip.slice(0, 100), input.userAgent.slice(0, 1000)]);
  const customer = (await db.query<{ client_user_id: string | null }>("SELECT client_user_id FROM bookings WHERE id=$1", [input.bookingId])).rows[0];
  await recordConsent(db, { userId: customer.client_user_id, bookingId: input.bookingId, kinds: ["booking_terms", "account_terms", "refund_policy", "privacy_policy"], source: "booking_accept", ip: input.ip, userAgent: input.userAgent });
  const advance = Number(booking.advance_paise);
  // Without online payments the booking waits (PENDING) for the vendor to record an offline advance, so the hold lengthens.
  const awaitsOffline = advance > 0 && !paymentsEnabled();
  await db.query(`UPDATE bookings SET terms_accepted_at=now()${awaitsOffline ? ", hold_expires_at=now()+make_interval(hours => $2)" : ""} WHERE id=$1`, awaitsOffline ? [input.bookingId, config.REQUEST_HOLD_HOURS] : [input.bookingId]);
  await transitionBooking(db, input.bookingId, "PENDING", "client", advance === 0 ? "terms accepted, nothing to pay" : awaitsOffline ? "terms accepted, advance to be arranged offline" : "terms accepted, advance to be paid online", { terms_sha256: contract.sha256 });
  if (advance === 0) await transitionBooking(db, input.bookingId, "CONFIRMED", "system", "no advance required");
  const status = (await bookingRow(db, input.bookingId)).status as string;
  if (status === "CONFIRMED") await notifyConfirmed(db, input.bookingId);
  else if (awaitsOffline) await notifyRequestToVendor(db, input.bookingId);
  return { booking: await bookingRow(db, input.bookingId) };
}
const bookingRow = async (db: PoolClient, id: string) => (await db.query(`SELECT ${bookingView} FROM bookings WHERE id=$1`, [id])).rows[0] as Record<string, unknown> & { id: string; status: string };

/** Tick expiry (SPEC 10.2): every vendor's overdue holds, safe to run late or twice. */
export async function sweepExpiredBookings(db: PoolClient) {
  return expireOverdueHolds(db, null);
}
