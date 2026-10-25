import { Router, type NextFunction, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { currentUser, revokeAllSessions, sessionCookieName, type SessionUser } from "./auth.js";
import { cookieOptions, cookieToken, perIp } from "./auth-routes.js";
import { writeAudit } from "./audit.js";
import { pool, transaction } from "./database.js";
import { AppError } from "./errors.js";

// Privacy rights for customers (SPEC 4.9 PV-02, 12.6): download everything held about them, and erase it. Erasure keeps the
// financial records the law requires (bookings, payments, refunds, ledger amounts) with the personal fields removed.

export const ERASED_MARKER = "[personal details removed]";
const erasedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;

/**
 * Closes a login: the email and password go, Google links and pending codes are removed, sessions end, and email copies to
 * the old address lose their content. Shared by customer erasure and vendor account deletion.
 */
export async function closeLogin(db: PoolClient, user: { id: string; email: string }) {
  await db.query("DELETE FROM auth_identities WHERE user_id=$1", [user.id]);
  await db.query("DELETE FROM otp_codes WHERE email_normalized=$1", [user.email.toLowerCase()]);
  await db.query("UPDATE email_outbox SET recipient=$2,subject='[removed]',text_body='[removed]',html_body=NULL,body_purged_at=now(),status=CASE WHEN status='queued' THEN 'failed' ELSE status END WHERE recipient=$1", [user.email, erasedEmail(user.id)]);
  await db.query("UPDATE users SET email=$2,display_name=NULL,password_hash=NULL,password_set_at=NULL,totp_secret_enc=NULL,totp_enabled_at=NULL,deleted_at=now() WHERE id=$1", [user.id, erasedEmail(user.id)]);
  await revokeAllSessions(db, user.id);
}

type Handler = (req: Request, res: Response, user: SessionUser) => Promise<unknown>;
const customer = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  currentUser(pool, cookieToken(req)).then(user => {
    if (!user || user.role !== "CLIENT") throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in with the email you booked with");
    return fn(req, res, user);
  }).catch(next);
};
/** A customer's bookings: made with their verified email or their account. */
const ownBookings = "(b.client_user_id=$1 OR b.client_email=$2)";

export const privacyRouter = Router();
privacyRouter.get("/export", perIp(10), customer(async (_req, res, user) => {
  const params = [user.id, user.email];
  const [bookings, events, payments, refunds, contracts, consents] = await Promise.all([
    pool.query(`SELECT b.id,b.status,b.service_name,b.starts_at,b.ends_at,b.client_name,b.client_email::text AS client_email,b.client_phone,b.customer_notes,b.total_paise,b.advance_paise,b.created_at,v.display_name AS business FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE ${ownBookings} ORDER BY b.created_at`, params),
    pool.query(`SELECT e.booking_id,e.from_status,e.to_status,e.actor,e.created_at FROM booking_events e JOIN bookings b ON b.id=e.booking_id WHERE ${ownBookings} ORDER BY e.created_at`, params),
    pool.query(`SELECT p.booking_id,p.provider,p.kind,p.status,p.amount_paise,p.method,p.created_at,p.verified_at FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE ${ownBookings} ORDER BY p.created_at`, params),
    pool.query(`SELECT r.booking_id,r.amount_paise,r.status,r.created_at,r.processed_at FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE ${ownBookings} ORDER BY r.created_at`, params),
    pool.query(`SELECT c.booking_id,c.body,c.sha256,c.accepted_at FROM booking_contracts c JOIN bookings b ON b.id=c.booking_id WHERE ${ownBookings}`, params),
    pool.query("SELECT kind,policy_version,source,created_at FROM consents WHERE user_id=$1 ORDER BY created_at", [user.id])
  ]);
  await writeAudit(pool, user.id, "customer.data_exported", "user", user.id);
  res.set({ "Content-Disposition": 'attachment; filename="bayana-my-data.json"', "Cache-Control": "private, no-store" })
    .json({ exported_at: new Date().toISOString(), account: { email: user.email }, bookings: bookings.rows, booking_events: events.rows, payments: payments.rows, refunds: refunds.rows, contracts: contracts.rows, consents: consents.rows });
}));

privacyRouter.post("/delete", perIp(5), customer(async (req, res, user) => {
  z.object({ confirm: z.literal("DELETE") }).strict().parse(req.body);
  await transaction(async db => {
    await db.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const active = await db.query(`SELECT 1 FROM bookings b WHERE ${ownBookings} AND b.status IN ('HELD','PENDING','CONFIRMED') AND b.ends_at > now() AND (b.status='CONFIRMED' OR b.hold_expires_at IS NULL OR b.hold_expires_at > now()) LIMIT 1`, [user.id, user.email]);
    if (active.rowCount) throw new AppError(409, "ACTIVE_BOOKINGS", "You have bookings coming up. Cancel them first, or ask the business to, then delete your data.");
    const erased = await db.query<{ id: string }>(`UPDATE bookings b SET client_name='Deleted customer',client_email=$3,client_phone='',customer_notes=NULL,referral=NULL,client_user_id=NULL,client_erased_at=now() WHERE ${ownBookings} RETURNING b.id`, [user.id, user.email, erasedEmail(user.id)]);
    const ids = erased.rows.map(row => row.id);
    // Money rows stay; only their free text, which can carry a name, is replaced.
    await db.query("UPDATE payments SET note=CASE WHEN note IS NULL THEN NULL ELSE $2 END,raw=NULL WHERE booking_id = ANY($1)", [ids, ERASED_MARKER]);
    await db.query("UPDATE ledger_entries SET reason=$2 WHERE booking_id = ANY($1) AND reason IS DISTINCT FROM $2", [ids, ERASED_MARKER]);
    await closeLogin(db, user);
    await writeAudit(db, null, "customer.erased", "user", user.id, { bookings: ids.length });
  });
  res.clearCookie(sessionCookieName, cookieOptions());
  res.status(204).end();
}));
