import { createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { refundPreview } from "@bayana/shared";
import { currentUser, type SessionUser } from "./auth.js";
import { cookieToken } from "./auth-routes.js";
import { acceptTerms, createHold } from "./booking-service.js";
import { transitionBooking } from "./booking-transition.js";
import { config } from "./config.js";
import { loadContract, parseSnapshot } from "./contract.js";
import { pool, transaction } from "./database.js";
import { AppError } from "./errors.js";

// Customer booking endpoints: hold (after OTP), accept terms, view by private link, cancel (SPEC 5.5, BK-08, CT-02/03).
const notFound = () => new AppError(404, "NOT_FOUND", "Not found");
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
export const tokenHash = (token: string) => createHash("sha256").update(`${config.SESSION_SECRET}:booking:${token}`).digest("hex");
const holdSchema = z.object({ slug: z.string(), date: localDate, service_id: z.string().uuid(), starts_at: z.string().datetime(), name: z.string().trim().min(2).max(120), phone: z.string().trim().min(8).max(20).optional(), notes: z.string().max(2000).optional(), referral: z.string().trim().max(200).optional() });

/** The customer who made it, the vendor who owns it, or anyone holding the private link token. Everything else is the same 404. */
async function bookingAccess(req: Request) {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw notFound();
  const user = await currentUser(pool, cookieToken(req));
  const token = req.header("x-booking-token") ?? (typeof req.query.t === "string" ? req.query.t : undefined);
  const found = await pool.query<{ id: string; is_vendor: boolean }>("SELECT b.id,v.owner_user_id IS NOT DISTINCT FROM $2 AS is_vendor FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1 AND (b.client_user_id=$2 OR v.owner_user_id=$2 OR ($3::text IS NOT NULL AND b.access_token_hash=$3))", [id.data, user?.id ?? null, token ? tokenHash(token) : null]);
  if (!found.rowCount) throw notFound();
  return { id: found.rows[0].id, user, isVendor: found.rows[0].is_vendor };
}

export const bookingRouter = Router();
bookingRouter.post("/", handle(async (req, res) => {
  const user = await currentUser(pool, cookieToken(req));
  if (!user || user.role !== "CLIENT") throw new AppError(401, "AUTHENTICATION_REQUIRED", "Verify your email to continue");
  const body = holdSchema.parse(req.body);
  const key = req.header("idempotency-key");
  if (!key || !z.string().uuid().safeParse(key).success) throw new AppError(400, "VALID_IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required");
  const booking = await transaction(db => createHold(db, { slug: body.slug, date: body.date, name: body.name, email: user.email, clientUserId: user.id, phone: body.phone, notes: body.notes, referral: body.referral, serviceId: body.service_id, startsAt: body.starts_at, key }));
  res.status(201).json({ booking });
}));

bookingRouter.get("/:id", handle(async (req, res) => {
  const access = await bookingAccess(req);
  res.json(await bookingView(access.id, access.isVendor));
}));

bookingRouter.post("/:id/accept", handle(async (req, res) => {
  const access = await bookingAccess(req);
  if (access.isVendor) throw notFound();
  const body = z.object({ terms_hash: z.string().regex(/^[0-9a-f]{64}$/), accepted: z.literal(true) }).parse(req.body);
  const owner = await pool.query<{ client_email: string }>("SELECT client_email::text AS client_email FROM bookings WHERE id=$1", [access.id]);
  // The verified email: the signed-in customer's, else the OTP-verified address the hold was made with.
  const email = access.user?.role === "CLIENT" ? access.user.email : owner.rows[0].client_email;
  const result = await transaction(db => acceptTerms(db, { bookingId: access.id, termsHash: body.terms_hash, email, ip: req.ip ?? "", userAgent: req.header("user-agent") ?? "" }));
  res.json(result);
}));

bookingRouter.post("/:id/cancel", handle(async (req, res) => {
  const access = await bookingAccess(req);
  // Vendor cancellation (full refund, BK-11) belongs to the dashboard phase.
  if (access.isVendor) throw notFound();
  const body = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});
  const view = await bookingView(access.id, access.isVendor);
  if (!view.can_cancel || !view.refund_preview) throw new AppError(409, "INVALID_TRANSITION", "This booking can no longer be cancelled here");
  const preview = view.refund_preview;
  // Issuing the refund belongs to the payments phase; the amount owed is recorded on the event now.
  await transaction(db => transitionBooking(db, access.id, "CANCELLED", "customer", body.reason || "cancelled by customer", { refund_paise: preview.refund_paise, refund_percent: preview.refund_percent, paid_paise: preview.paid_paise }));
  res.json(await bookingView(access.id, access.isVendor));
}));

type Row = { id: string; status: string; service_name: string | null; starts_at: Date; ends_at: Date; hold_expires_at: Date | null; total_paise: string; advance_paise: string; paid_paise: string; client_name: string; terms_snapshot: string | null; slug: string; display_name: string; timezone: string; duration_minutes: number | null };
async function bookingView(id: string, forVendor: boolean) {
  const [booking, events, payments, contract] = await Promise.all([
    pool.query<Row>("SELECT b.id,b.status,b.service_name,b.starts_at,b.ends_at,b.hold_expires_at,b.total_paise,b.advance_paise,COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind IN ('PAYMENT','REFUND')),0) AS paid_paise,b.client_name,b.terms_snapshot,b.duration_minutes,v.slug::text AS slug,v.display_name,v.timezone FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1", [id]),
    pool.query<{ to_status: string; created_at: Date }>("SELECT to_status,created_at FROM booking_events WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT id,status,amount_paise,created_at FROM payments WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query<{ body: string; sha256: string; accepted_at: Date }>("SELECT body,sha256,accepted_at FROM booking_contracts WHERE booking_id=$1", [id])
  ]);
  const b = booking.rows[0];
  const holdLive = b.status === "HELD" && !!b.hold_expires_at && b.hold_expires_at > new Date();
  // The display treats a lapsed hold as expired even before the lazy expiry or the tick runs (SPEC 10.2).
  const status = (b.status === "HELD" || b.status === "PENDING") && b.hold_expires_at && b.hold_expires_at <= new Date() ? "EXPIRED" : b.status;
  const paid = Number(b.paid_paise), total = Number(b.total_paise);
  const cancellable = ["PENDING", "CONFIRMED"].includes(status) && b.starts_at > new Date();
  const preview = holdLive ? await loadContract(pool, id) : null;
  return {
    id: b.id, status, service_name: b.service_name, duration_minutes: b.duration_minutes, starts_at: b.starts_at, ends_at: b.ends_at, hold_expires_at: b.hold_expires_at, timezone: b.timezone,
    vendor: { slug: b.slug, display_name: b.display_name }, client_name: b.client_name,
    total_paise: total, advance_paise: Number(b.advance_paise), paid_paise: paid, balance_due_paise: total - paid,
    payments_enabled: config.PAYMENT_MODE !== "disabled", viewer: forVendor ? "vendor" : "customer",
    timeline: events.rows, payments: payments.rows,
    contract: contract.rowCount ? contract.rows[0] : null,
    contract_preview: preview ? { body: preview.text, sha256: preview.sha256 } : null,
    cancellation_tiers: parseSnapshot(b.terms_snapshot).cancellation_tiers,
    can_cancel: cancellable,
    refund_preview: cancellable ? refundPreview(paid, parseSnapshot(b.terms_snapshot).cancellation_tiers, b.starts_at) : null
  };
}

/** Bookings made with the signed-in customer's verified email. */
export async function customerBookings(user: SessionUser) {
  return (await pool.query("SELECT b.id,b.status,b.starts_at,b.total_paise,b.advance_paise,b.service_name,v.slug,v.display_name,v.timezone,b.total_paise-COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind IN ('PAYMENT','REFUND')),0) AS balance_due_paise FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.client_email=$1 ORDER BY b.created_at DESC", [user.email])).rows;
}
