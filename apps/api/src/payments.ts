import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { transition } from "./booking-service.js";

const provider = () => {
  if (config.PAYMENT_MODE === "disabled") throw Object.assign(new Error("Online advance payment is not enabled"), { status: 503, code: "PAYMENTS_NOT_CONFIGURED" });
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) throw Object.assign(new Error("Payments are not configured"), { status: 503, code: "PAYMENTS_NOT_CONFIGURED" });
  return new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET });
};
export async function createCheckoutOrder(db: PoolClient, booking: any) {
  if (booking.status !== "HELD" || new Date(booking.hold_expires_at) <= new Date()) throw Object.assign(new Error("Booking hold has expired"), { status: 409 });
  const order = await provider().orders.create({ amount: Number(booking.advance_paise), currency: "INR", receipt: booking.id, notes: { booking_id: booking.id } });
  await db.query("INSERT INTO payments(id,booking_id,provider_order_id,status,amount_paise) VALUES($1,$2,$3,'CREATED',$4) ON CONFLICT(provider_order_id) DO NOTHING", [randomUUID(), booking.id, order.id, booking.advance_paise]);
  return { key_id: config.RAZORPAY_KEY_ID, order_id: order.id, amount_paise: Number(booking.advance_paise), currency: "INR" };
}
export function verifyWebhook(raw: Buffer, signature?: string) {
  if (!config.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function captureFromWebhook(db: PoolClient, event: any) {
  if (event.event !== "payment.captured") return;
  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || !Number.isInteger(payment.amount)) throw Object.assign(new Error("Malformed payment webhook"), { status: 400 });
  const q = await db.query("SELECT b.*, p.id AS payment_row_id,p.status AS payment_status FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE p.provider_order_id=$1 FOR UPDATE", [payment.order_id]);
  if (!q.rowCount) throw Object.assign(new Error("Unknown Razorpay order"), { status: 404 });
  const booking = q.rows[0];
  if (booking.payment_status === "CAPTURED") return;
  if (booking.status !== "HELD" || Number(booking.advance_paise) !== payment.amount || payment.currency !== "INR") throw Object.assign(new Error("Payment does not match an active booking hold"), { status: 409 });
  await db.query("UPDATE payments SET status='CAPTURED',provider_payment_id=$1,raw_event=$2 WHERE id=$3", [payment.id, event, booking.payment_row_id]);
  await db.query("INSERT INTO ledger_entries(id,booking_id,payment_id,kind,amount_paise,actor,reason) VALUES($1,$2,$3,'CHARGE',$4,'system','booking total'),($5,$2,$3,'PAYMENT',$6,'razorpay','verified Razorpay capture')", [randomUUID(), booking.id, booking.payment_row_id, booking.total_paise, randomUUID(), -booking.advance_paise]);
  await transition(db, booking, "CONFIRMED", "razorpay", "verified payment.captured webhook");
}
