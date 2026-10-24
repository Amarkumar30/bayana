import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { advancePaise } from "@bayana/shared";
import { config } from "./config.js";
import { slotsForDate } from "./availability.js";
import { loadSlotEngineInput } from "./slot-data.js";

const allowed: Record<string, string[]> = { HELD: ["CONFIRMED", "EXPIRED", "CANCELLED"], CONFIRMED: ["COMPLETED", "CANCELLED"], EXPIRED_PAID: ["CANCELLED"], COMPLETED: [], CANCELLED: [], EXPIRED: [] };
export async function transitionBooking(db: PoolClient, booking: { id: string; status: string }, to: string, actor: string, reason: string) {
  if (!allowed[booking.status]?.includes(to)) throw new Error(`Invalid booking transition ${booking.status} -> ${to}`);
  await db.query("UPDATE bookings SET status=$1 WHERE id=$2", [to, booking.id]);
  await db.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), booking.id, booking.status, to, actor, reason]);
}
type HoldInput = { slug: string; date: string; name: string; email: string; clientUserId: string; phone?: string; notes?: string; referral?: string; serviceId: string; startsAt: string; termsAccepted: boolean; key: string };
type Service = { id: string; name: string; price_paise: string; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number; booking_mode: "TIMED" | "FULL_DAY"; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number };
export async function createHold(db: PoolClient, input: HoldInput) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ slug: input.slug, date: input.date, name: input.name, phone: input.phone ?? "", notes: input.notes ?? "", referral: input.referral ?? "", serviceId: input.serviceId, startsAt: input.startsAt, termsAccepted: input.termsAccepted, clientUserId: input.clientUserId })).digest("hex");
  const existing = await db.query("SELECT * FROM bookings WHERE idempotency_key=$1", [input.key]);
  if (existing.rowCount) { if (existing.rows[0].idempotency_fingerprint && existing.rows[0].idempotency_fingerprint !== fingerprint) throw Object.assign(new Error("This idempotency key was already used with different booking details"), { status: 422, code: "IDEMPOTENCY_KEY_REUSED" }); return existing.rows[0]; }
  const vendor = await db.query<{ id: string; timezone: string; phone_required: boolean; payment_required: boolean; owner_email: string | null }>("SELECT v.id,v.timezone,v.phone_required,v.payment_required,u.email::text AS owner_email FROM vendors v LEFT JOIN users u ON u.id=v.owner_user_id WHERE v.slug=$1 AND v.bookings_enabled AND v.published FOR UPDATE", [input.slug]);
  if (!vendor.rowCount) throw Object.assign(new Error("Vendor is unavailable"), { status: 404, code: "NOT_FOUND" });
  if (!input.termsAccepted) throw Object.assign(new Error("You must accept the vendor policies"), { status: 400, code: "TERMS_REQUIRED" });
  const p = vendor.rows[0];
  if (p.phone_required && !input.phone) throw Object.assign(new Error("Phone number is required by this vendor"), { status: 400, code: "PHONE_REQUIRED" });
  await db.query("UPDATE bookings SET status='EXPIRED' WHERE vendor_id=$1 AND status IN ('HELD','PENDING') AND hold_expires_at < now()", [p.id]);
  const serviceResult = await db.query<Service>("SELECT id,name,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,advance_type,advance_value FROM services WHERE id=$1 AND vendor_id=$2 AND active FOR UPDATE", [input.serviceId, p.id]);
  if (!serviceResult.rowCount) throw Object.assign(new Error("Service unavailable"), { status: 409, code: "SERVICE_UNAVAILABLE" });
  const service = serviceResult.rows[0];
  const engine = await loadSlotEngineInput(db, p.id, service.id);
  const slot = engine ? slotsForDate(input.date, engine).find(value => value.startsAt === input.startsAt) : undefined;
  if (!slot) throw Object.assign(new Error("That time is no longer available"), { status: 409, code: "SLOT_UNAVAILABLE" });
  const terms = await db.query<{ terms: string; cancellation_policy: string; rescheduling_policy: string }>("SELECT terms,cancellation_policy,rescheduling_policy FROM vendors WHERE id=$1", [p.id]);
  const total = Number(service.price_paise), advance = advancePaise(total, service.advance_type, service.advance_value);
  if (advance > 0 && advance < config.MIN_ADVANCE_PAISE) throw Object.assign(new Error("Invalid advance rule"), { status: 400, code: "INVALID_ADVANCE" });
  const status = advance === 0 ? "CONFIRMED" : config.PAYMENT_MODE === "disabled" ? "PENDING" : "HELD";
  const expires = new Date(Date.now() + (status === "PENDING" ? config.REQUEST_HOLD_HOURS * 3_600_000 : config.HOLD_MINUTES * 60_000));
  const id = randomUUID(), accessToken = randomBytes(32).toString("base64url"), accessHash = createHash("sha256").update(`${config.SESSION_SECRET}:booking:${accessToken}`).digest("hex");
  const result = await db.query("INSERT INTO bookings(id,vendor_id,client_user_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,idempotency_fingerprint,access_token_hash,service_id,service_name,duration_minutes,starts_at,starts_at_utc,ends_at_utc,occupied_starts_at,occupied_ends_at,customer_notes,referral,terms_accepted_at,payment_required,service_price_paise,service_advance_type,service_advance_value,buffer_before_minutes,buffer_after_minutes,terms_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now(),$26,$27,$28,$29,$30,$31,$32) RETURNING *", [id,p.id,input.clientUserId,input.date,input.name,input.email,input.phone ?? "",status,total,advance,expires,input.key,fingerprint,accessHash,service.id,service.name,service.duration_minutes,input.startsAt.slice(11, 16),slot.startsAt,slot.endsAt,slot.occupiedStartsAt,slot.occupiedEndsAt,input.notes ?? null,input.referral ?? null,p.payment_required,total,service.advance_type,service.advance_value,service.buffer_before_minutes,service.buffer_after_minutes,JSON.stringify(terms.rows[0])]);
  await db.query("INSERT INTO booking_events(id,booking_id,to_status,actor,reason) VALUES($1,$2,$3,'client',$4)", [randomUUID(), id, status, status === "CONFIRMED" ? "no advance required" : status === "PENDING" ? "advance arrangement requested" : "payment hold created"]);
  const message = status === "CONFIRMED" ? "Your booking is confirmed." : status === "PENDING" ? "Request received, advance to be arranged." : "Your booking is held while payment is arranged.";
  // The first WEB_ORIGINS entry is the canonical public site used in emailed links.
  const link = `${config.WEB_ORIGINS[0]}/booking/${id}?t=${accessToken}`;
  await db.query("INSERT INTO email_outbox(id,booking_id,recipient,subject,text_body) VALUES($1,$2,$3,$4,$5)", [randomUUID(),id,input.email,`Booking ${status.toLowerCase()}`,`${message}\nView booking: ${link}`]);
  if (p.owner_email) await db.query("INSERT INTO email_outbox(id,booking_id,recipient,subject,text_body) VALUES($1,$2,$3,$4,$5)", [randomUUID(),id,p.owner_email,"New booking request",`${input.name} booked ${service.name}.`]);
  return result.rows[0];
}

export async function sweepExpiredBookings(db: Pool) {
  const lock = await db.query<{ pg_try_advisory_lock: boolean }>("SELECT pg_try_advisory_lock(4815162350)");
  if (!lock.rows[0]?.pg_try_advisory_lock) return 0;
  try { const result = await db.query("UPDATE bookings SET status='EXPIRED' WHERE status IN ('HELD','PENDING') AND hold_expires_at < now()"); return result.rowCount ?? 0; }
  finally { await db.query("SELECT pg_advisory_unlock(4815162350)"); }
}
