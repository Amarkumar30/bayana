import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { percentageOf } from "@bayana/shared";
import { config } from "./config.js";

const allowed: Record<string, string[]> = { HELD: ["CONFIRMED", "EXPIRED", "CANCELLED"], CONFIRMED: ["COMPLETED", "CANCELLED"], EXPIRED_PAID: ["CANCELLED"], COMPLETED: [], CANCELLED: [], EXPIRED: [] };
export async function transition(db: PoolClient, booking: { id: string; status: string }, to: string, actor: string, reason: string) {
  if (!allowed[booking.status]?.includes(to)) throw new Error(`Invalid booking transition ${booking.status} -> ${to}`);
  await db.query("UPDATE bookings SET status=$1 WHERE id=$2", [to, booking.id]);
  await db.query("INSERT INTO booking_events(id,booking_id,from_status,to_status,actor,reason) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), booking.id, booking.status, to, actor, reason]);
}
export async function createHold(db: PoolClient, input: { slug: string; date: string; name: string; email: string; phone?: string; notes?: string; serviceId?: string; startsAt?: string; termsAccepted: boolean; key: string }) {
  if (input.date < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error("Past dates cannot be booked"), { status: 400, code: "PAST_DATE" });
  const existing = await db.query("SELECT * FROM bookings WHERE idempotency_key=$1", [input.key]);
  if (existing.rowCount) return existing.rows[0];
  const photographer = await db.query("SELECT * FROM photographers WHERE slug=$1 FOR UPDATE", [input.slug]);
  if (!photographer.rowCount || !photographer.rows[0].bookings_enabled || !photographer.rows[0].published) throw Object.assign(new Error("Vendor is unavailable"), { status: 404 });
  if (!input.termsAccepted) throw Object.assign(new Error("You must accept the vendor policies"), { status: 400, code: "TERMS_REQUIRED" });
  await db.query("UPDATE bookings SET status='EXPIRED' WHERE photographer_id=$1 AND event_date=$2 AND status='HELD' AND hold_expires_at < now()", [photographer.rows[0].id, input.date]);
  const availability = await db.query("SELECT * FROM availability WHERE photographer_id=$1 AND event_date=$2", [photographer.rows[0].id, input.date]);
  if (!availability.rowCount || availability.rows[0].state !== "AVAILABLE") throw Object.assign(new Error("Date unavailable"), { status: 409 });
  const p = photographer.rows[0];
  if (p.phone_required && !input.phone) throw Object.assign(new Error("Phone number is required by this vendor"), { status: 400 });
  let service: any = null;
  if (input.serviceId) { const q = await db.query("SELECT * FROM services WHERE id=$1 AND photographer_id=$2 AND active FOR UPDATE", [input.serviceId, p.id]); if (!q.rowCount) throw Object.assign(new Error("Service unavailable"), { status: 409 }); service = q.rows[0]; }
  if (input.startsAt) { const slot = await db.query("SELECT 1 FROM availability_slots WHERE photographer_id=$1 AND event_date=$2 AND starts_at=$3 AND state='AVAILABLE' FOR UPDATE", [p.id, input.date, input.startsAt]); if (!slot.rowCount) throw Object.assign(new Error("Time slot unavailable"), { status: 409 }); }
  const total = Number(service?.price_paise ?? availability.rows[0].price_paise ?? p.base_price_paise);
  const advance = p.advance_type === "PERCENT" ? percentageOf(total, p.advance_value) : p.advance_value;
  if (advance < config.MIN_ADVANCE_PAISE || advance > total) throw new Error("Invalid advance rule");
  const id = randomUUID(); const expires = new Date(Date.now() + config.HOLD_MINUTES * 60_000);
  const result = await db.query("INSERT INTO bookings(id,photographer_id,event_date,client_name,client_email,client_phone,status,total_paise,advance_paise,hold_expires_at,idempotency_key,service_id,service_name,duration_minutes,starts_at,customer_notes,terms_accepted_at,payment_required) VALUES($1,$2,$3,$4,$5,$6,'HELD',$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16) RETURNING *", [id,p.id,input.date,input.name,input.email,input.phone ?? '',total,advance,expires,input.key,service?.id ?? null,service?.name ?? 'Standard service',service?.duration_minutes ?? null,input.startsAt ?? null,input.notes ?? null,p.payment_required]);
  await db.query("INSERT INTO booking_events(id,booking_id,to_status,actor,reason) VALUES($1,$2,'HELD','client','payment hold created')", [randomUUID(), id]);
  return result.rows[0];
}
