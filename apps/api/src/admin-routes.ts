import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { formatINR } from "@bayana/shared";
import { currentUser, event, type SessionUser } from "./auth.js";
import { cookieToken, perIp } from "./auth-routes.js";
import { writeAudit } from "./audit.js";
import { pool } from "./database.js";
import { AppError } from "./errors.js";
import { runNightly, runTick } from "./jobs.js";
import { sendOutbox } from "./notifications/outbox.js";
import { paymentMode, paymentProvider, paymentsEnabled } from "./payments/runtime.js";
import { applyCapturedPayment, markOpenPayment } from "./payments/service.js";
import { processWebhookEvent } from "./payments/webhooks.js";
import { decryptSecret, encryptSecret, matchTotp, newTotpSecret, otpauthUrl, base32Encode } from "./totp.js";

// Admin console API (SPEC 4.8 AD-01..04, 5.4, AU-10). Access needs users.is_admin (set only with SQL) AND a TOTP check on
// this session within the last 12 hours. Every read of operational data and every action writes an audit_logs row.

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const adminOf = (res: Response) => res.locals.admin as SessionUser;
const SECOND_FACTOR_HOURS = 12, TOTP_FAILURES_PER_15_MIN = 5, PAGE = 50;
const like = (value: string) => `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`;
const uuid = (value: unknown) => { const parsed = z.string().uuid().safeParse(value); if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Not found"); return parsed.data; };
const searchSchema = z.object({ q: z.string().trim().max(200).optional(), status: z.string().trim().max(40).optional() });

type AdminRow = { is_admin: boolean; totp_secret_enc: string | null; totp_enabled_at: Date | null; totp_last_step: string | null; second_factor_at: Date | null };
async function adminState(user: SessionUser) {
  return (await pool.query<AdminRow>("SELECT u.is_admin,u.totp_secret_enc,u.totp_enabled_at,u.totp_last_step,s.second_factor_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.deleted_at IS NULL", [user.id, user.sessionId])).rows[0];
}
/** Signed in and is_admin. Anyone else gets the same 404 as an unknown route, so the console is not advertised. */
async function requireAdminAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await currentUser(pool, cookieToken(req));
    if (!user) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue");
    const state = await adminState(user);
    if (!state?.is_admin) throw new AppError(404, "NOT_FOUND", "Not found");
    res.locals.admin = user; res.locals.adminState = state; next();
  } catch (error) { next(error); }
}
/** AU-10: plus a second factor verified on this very session, recently. */
function requireSecondFactor(_req: Request, res: Response, next: NextFunction) {
  const state = res.locals.adminState as AdminRow;
  const fresh = state.second_factor_at && state.second_factor_at.getTime() > Date.now() - SECOND_FACTOR_HOURS * 3_600_000;
  if (!state.totp_enabled_at || !fresh) return next(new AppError(403, "SECOND_FACTOR_REQUIRED", "Confirm it's you with your authenticator app.", { enrolled: Boolean(state.totp_enabled_at) }));
  next();
}
const audited = (res: Response, action: string, type: string, id: string, meta: Record<string, unknown> = {}) => writeAudit(pool, adminOf(res).id, action, type, id, meta);

export const adminRouter = Router();
adminRouter.use((_req, res, next) => { res.set("X-Robots-Tag", "noindex, nofollow"); res.set("Cache-Control", "private, no-store"); next(); });
adminRouter.use(perIp(120));
adminRouter.use(requireAdminAccount);

// ---- Second factor ------------------------------------------------------------------------------------------------
adminRouter.get("/2fa", handle(async (_req, res) => {
  const state = res.locals.adminState as AdminRow;
  res.json({ enrolled: Boolean(state.totp_enabled_at), verified: Boolean(state.second_factor_at && state.second_factor_at.getTime() > Date.now() - SECOND_FACTOR_HOURS * 3_600_000), email: adminOf(res).email });
}));
/** First enrolment only; a lost authenticator is reset with SQL by another admin (docs/RUN_LOCAL.md). */
adminRouter.post("/2fa/enroll", handle(async (_req, res) => {
  const state = res.locals.adminState as AdminRow;
  if (state.totp_enabled_at) throw new AppError(409, "ALREADY_ENROLLED", "Your authenticator is already set up.");
  const secret = newTotpSecret();
  await pool.query("UPDATE users SET totp_secret_enc=$2 WHERE id=$1 AND totp_enabled_at IS NULL", [adminOf(res).id, encryptSecret(secret)]);
  await writeAudit(pool, adminOf(res).id, "admin.2fa_enrolment_started", "user", adminOf(res).id);
  res.json({ secret: base32Encode(secret), otpauth_url: otpauthUrl(secret, adminOf(res).email) });
}));
adminRouter.post("/2fa/verify", handle(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your app.") }).strict().parse(req.body);
  const user = adminOf(res);
  const failures = (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM auth_events WHERE user_id=$1 AND type='admin_2fa_failed' AND created_at > now() - interval '15 minutes'", [user.id])).rows[0].n;
  if (failures >= TOTP_FAILURES_PER_15_MIN) throw new AppError(429, "RATE_LIMITED", "Too many wrong codes. Wait 15 minutes and try again.");
  const state = (await pool.query<AdminRow>("SELECT totp_secret_enc,totp_enabled_at,totp_last_step FROM users WHERE id=$1", [user.id])).rows[0];
  if (!state.totp_secret_enc) throw new AppError(409, "NOT_ENROLLED", "Set up your authenticator first.");
  const step = matchTotp(decryptSecret(state.totp_secret_enc), code);
  // The step is claimed atomically, so the same code cannot be used twice (replay), even by two requests at once.
  const claimed = step === null ? null : await pool.query("UPDATE users SET totp_last_step=$2,totp_enabled_at=COALESCE(totp_enabled_at,now()) WHERE id=$1 AND (totp_last_step IS NULL OR totp_last_step < $2) RETURNING id", [user.id, step]);
  if (!claimed?.rowCount) { await event(pool, user.id, "admin_2fa_failed", req.ip, req.header("user-agent")); throw new AppError(400, "OTP_INVALID", "That code is wrong or was already used. Wait for the next one."); }
  await pool.query("UPDATE sessions SET second_factor_at=now() WHERE id=$1", [user.sessionId]);
  await event(pool, user.id, "admin_2fa_verified", req.ip, req.header("user-agent"));
  await writeAudit(pool, user.id, "admin.2fa_verified", "session", user.sessionId);
  res.json({ verified: true });
}));

adminRouter.use(requireSecondFactor);

// ---- Health (AD-03) -----------------------------------------------------------------------------------------------
export const STALE_TICK_MINUTES = 30;
adminRouter.get("/health", handle(async (_req, res) => {
  const row = (await pool.query(`SELECT
    (SELECT max(started_at) FROM job_runs WHERE job='expire_holds') AS last_tick,
    (SELECT status FROM job_runs WHERE job='expire_holds' ORDER BY started_at DESC LIMIT 1) AS last_tick_status,
    (SELECT max(started_at) FROM job_runs WHERE job='reconcile_payments') AS last_reconcile,
    (SELECT status FROM job_runs WHERE job='reconcile_payments' ORDER BY started_at DESC LIMIT 1) AS last_reconcile_status,
    (SELECT count(*)::int FROM job_runs WHERE status='failed' AND started_at > now() - interval '1 day') AS failed_jobs_24h,
    (SELECT count(*)::int FROM email_outbox WHERE status='queued') AS outbox_queued,
    (SELECT min(created_at) FROM email_outbox WHERE status='queued') AS outbox_oldest,
    (SELECT count(*)::int FROM email_outbox WHERE status='failed' AND failed_at > now() - interval '7 days') AS outbox_failed_7d,
    (SELECT max(received_at) FROM webhook_events) AS last_webhook,
    (SELECT count(*)::int FROM webhook_events WHERE needs_review) AS webhooks_review,
    (SELECT count(*)::int FROM webhook_events WHERE processed_at IS NULL AND NOT needs_review) AS webhooks_waiting,
    (SELECT count(*)::int FROM bookings WHERE status IN ('HELD','PENDING') AND hold_expires_at < now() - interval '1 hour') AS holds_overdue`)).rows[0];
  const tickAgeMinutes = row.last_tick ? Math.round((Date.now() - new Date(row.last_tick).getTime()) / 60_000) : null;
  await audited(res, "admin.view", "health", "-");
  res.json({ database: "ok", payment_mode: paymentMode(), ...row, tick_age_minutes: tickAgeMinutes, tick_stale: tickAgeMinutes === null || tickAgeMinutes > STALE_TICK_MINUTES });
}));

// ---- Lists and details (AD-01, AD-04) -----------------------------------------------------------------------------
adminRouter.get("/users", handle(async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const rows = (await pool.query(`SELECT u.id,u.email::text AS email,u.role,u.is_admin,u.totp_enabled_at IS NOT NULL AS has_2fa,u.created_at,u.deleted_at,v.id AS vendor_id,v.slug::text AS vendor_slug,
      (SELECT max(last_used_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen FROM users u LEFT JOIN vendors v ON v.owner_user_id=u.id
    WHERE ($1::text IS NULL OR u.email::text ILIKE $1 OR u.id::text = $2) ORDER BY u.created_at DESC LIMIT ${PAGE}`, [q ? like(q) : null, q ?? null])).rows;
  await audited(res, "admin.view", "users", "list", { q: q ?? null, count: rows.length });
  res.json({ users: rows });
}));
adminRouter.get("/users/:id", handle(async (req, res) => {
  const id = uuid(req.params.id);
  const user = (await pool.query("SELECT u.id,u.email::text AS email,u.role,u.is_admin,u.totp_enabled_at,u.created_at,u.email_verified_at,u.password_set_at IS NOT NULL AS has_password,u.deleted_at,v.id AS vendor_id,v.slug::text AS vendor_slug FROM users u LEFT JOIN vendors v ON v.owner_user_id=u.id WHERE u.id=$1", [id])).rows[0];
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  const [sessions, events, bookings] = await Promise.all([
    pool.query("SELECT id,created_at,last_used_at,revoked_at,expires_at,host(ip) AS ip,left(user_agent,120) AS user_agent,second_factor_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [id]),
    pool.query("SELECT type,created_at,host(ip) AS ip FROM auth_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30", [id]),
    pool.query("SELECT b.id,b.status,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.service_name,v.slug::text AS vendor_slug FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.client_user_id=$1 OR b.client_email=$2 ORDER BY b.created_at DESC LIMIT 30", [id, user.email])
  ]);
  await audited(res, "admin.view", "user", id);
  res.json({ user, sessions: sessions.rows, auth_events: events.rows, bookings: bookings.rows });
}));
adminRouter.get("/vendors", handle(async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const rows = (await pool.query(`SELECT v.id,v.slug::text AS slug,v.display_name,v.city,v.published,v.created_at,u.email::text AS owner_email,
      (SELECT count(*)::int FROM bookings b WHERE b.vendor_id=v.id) AS bookings,(SELECT count(*)::int FROM bookings b WHERE b.vendor_id=v.id AND b.status IN ('HELD','PENDING')) AS open_bookings
    FROM vendors v LEFT JOIN users u ON u.id=v.owner_user_id WHERE ($1::text IS NULL OR v.slug::text ILIKE $1 OR v.display_name ILIKE $1 OR u.email::text ILIKE $1) ORDER BY v.created_at DESC LIMIT ${PAGE}`, [q ? like(q) : null])).rows;
  await audited(res, "admin.view", "vendors", "list", { q: q ?? null, count: rows.length });
  res.json({ vendors: rows });
}));
adminRouter.get("/vendors/:id", handle(async (req, res) => {
  const id = uuid(req.params.id);
  const vendor = (await pool.query("SELECT v.id,v.slug::text AS slug,v.display_name,v.city,v.timezone,v.published,v.bookings_enabled,v.created_at,v.min_notice_minutes,v.max_advance_days,u.id AS owner_user_id,u.email::text AS owner_email FROM vendors v LEFT JOIN users u ON u.id=v.owner_user_id WHERE v.id=$1", [id])).rows[0];
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Vendor not found");
  const [services, bookings] = await Promise.all([
    pool.query("SELECT id,name,price_paise::int AS price_paise,duration_minutes,advance_type,advance_value,active FROM services WHERE vendor_id=$1 ORDER BY sort_order", [id]),
    pool.query("SELECT id,status,starts_at,booking_mode,days_count,(starts_at AT TIME ZONE vendor_timezone)::date::text AS first_date,client_name,service_name FROM bookings WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 30", [id])
  ]);
  await audited(res, "admin.view", "vendor", id);
  res.json({ vendor, services: services.rows, bookings: bookings.rows });
}));
adminRouter.get("/bookings", handle(async (req, res) => {
  const { q, status } = searchSchema.parse(req.query);
  // Search by customer email or name, vendor slug, or a booking id (full, or the start of one).
  const rows = (await pool.query(`SELECT b.id,b.status,b.hold_expires_at,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.client_name,b.client_email::text AS client_email,b.service_name,b.total_paise::int AS total_paise,b.advance_paise::int AS advance_paise,v.slug::text AS vendor_slug,b.created_at
    FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE ($1::text IS NULL OR b.client_email::text ILIKE $1 OR b.client_name ILIKE $1 OR v.slug::text ILIKE $1 OR b.id::text LIKE $2) AND ($3::text IS NULL OR b.status=$3)
    ORDER BY b.created_at DESC LIMIT ${PAGE}`, [q ? like(q) : null, q ? `${q.toLowerCase().replace(/[\\%_]/g, "")}%` : null, status ?? null])).rows;
  await audited(res, "admin.view", "bookings", "list", { q: q ?? null, status: status ?? null, count: rows.length });
  res.json({ bookings: rows });
}));

/** The gate of this phase: everything about one booking in one place, plus plain-language reasons it might be stuck. */
adminRouter.get("/bookings/:id", handle(async (req, res) => {
  const id = uuid(req.params.id);
  const booking = (await pool.query(`SELECT b.*,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.client_email::text AS client_email,v.slug::text AS vendor_slug,v.display_name AS vendor_name,v.timezone,u.email::text AS vendor_email
    FROM bookings b JOIN vendors v ON v.id=b.vendor_id LEFT JOIN users u ON u.id=v.owner_user_id WHERE b.id=$1`, [id])).rows[0];
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found");
  const { access_token_hash: _token, idempotency_fingerprint: _fingerprint, terms_snapshot: _terms, ...safe } = booking;
  const [events, payments, refunds, outbox, contract, audit] = await Promise.all([
    pool.query("SELECT from_status,to_status,actor,reason,meta,created_at FROM booking_events WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT id,provider,kind,status,amount_paise::int AS amount_paise,currency,provider_order_id,provider_payment_id,method,failure_reason,note,created_at,verified_at,updated_at FROM payments WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT id,payment_id,amount_paise::int AS amount_paise,status,provider_refund_id,reason,error,created_at,processed_at FROM refunds WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT id,template,recipient::text AS recipient,status,attempts,last_error,next_attempt_at,sent_at,failed_at,created_at FROM email_outbox WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT sha256,accepted_at,accepted_email::text AS accepted_email FROM booking_contracts WHERE booking_id=$1", [id]),
    pool.query("SELECT action,actor_user_id,metadata,created_at FROM audit_logs WHERE resource_type='booking' AND resource_id=$1 AND action <> 'admin.view' ORDER BY created_at DESC LIMIT 50", [id])
  ]);
  const orderIds = payments.rows.map(row => row.provider_order_id).filter(Boolean), paymentIds = payments.rows.map(row => row.provider_payment_id).filter(Boolean);
  const webhooks = orderIds.length || paymentIds.length ? (await pool.query(`SELECT event_id,type,received_at,processed_at,error,needs_review FROM webhook_events
    WHERE payload #>> '{payload,payment,entity,order_id}' = ANY($1) OR payload #>> '{payload,refund,entity,payment_id}' = ANY($2) OR payload #>> '{payload,order,entity,id}' = ANY($1) ORDER BY received_at`, [orderIds, paymentIds])).rows : [];
  const diagnosis = diagnose({ booking, payments: payments.rows, refunds: refunds.rows, outbox: outbox.rows, webhooks, hasContract: Boolean(contract.rowCount), onlinePayments: paymentsEnabled() });
  await audited(res, "admin.view", "booking", id);
  res.json({ booking: safe, events: events.rows, payments: payments.rows, refunds: refunds.rows, outbox: outbox.rows, webhooks, contract: contract.rows[0] ?? null, audit: audit.rows, diagnosis, payments_enabled: paymentsEnabled() });
}));

type Finding = { level: "ok" | "info" | "warning" | "problem"; text: string; action?: { kind: "reverify_payment" | "reprocess_webhook" | "retry_email" | "run_tick"; id?: string; label: string } };
type DiagnoseInput = { booking: Record<string, unknown>; payments: Record<string, unknown>[]; refunds: Record<string, unknown>[]; outbox: Record<string, unknown>[]; webhooks: Record<string, unknown>[]; hasContract: boolean; onlinePayments: boolean };
/** Pure: what state the booking is in, what it is waiting for, and the one action that would move it on. */
export function diagnose({ booking, payments, refunds, outbox, webhooks, hasContract, onlinePayments }: DiagnoseInput, now = new Date()): Finding[] {
  const out: Finding[] = [];
  const status = String(booking.status), holdExpires = booking.hold_expires_at ? new Date(String(booking.hold_expires_at)) : null;
  const advance = Number(booking.advance_paise), verified = payments.filter(p => p.verified_at), lapsed = !!holdExpires && holdExpires <= now;
  const paidVerified = verified.reduce((sum, p) => sum + Number(p.amount_paise), 0);
  if ((status === "HELD" || status === "PENDING") && lapsed) out.push({ level: "warning", text: `The hold lapsed at ${holdExpires.toISOString()} but the status is still ${status}. The next tick (or any new booking for this vendor) expires it.`, action: { kind: "run_tick", label: "Run the tick now" } });
  if (status === "HELD" && !lapsed) out.push({ level: "info", text: hasContract ? "Terms accepted; waiting for the next step." : "Waiting for the customer to agree to the terms." });
  if (status === "PENDING" && !lapsed) {
    if (advance > 0 && paidVerified < advance) {
      const online = payments.filter(p => p.provider === "razorpay");
      if (!online.length) out.push({ level: "info", text: onlinePayments ? `Waiting for the customer to pay the ${formatINR(advance)} advance; checkout has not been opened yet. The hold lapses at ${holdExpires?.toISOString() ?? "no set time"}.` : `Waiting for the vendor to record the ${formatINR(advance)} advance received offline (online payments are off).` });
      for (const p of online.filter(p => !p.verified_at)) {
        if (p.status === "failed") out.push({ level: "info", text: `Checkout attempt failed: ${p.failure_reason ?? "no reason given"}. The customer can try again until the hold lapses.` });
        else if (p.status === "authorized") out.push({ level: "warning", text: "The payment is authorised but not captured yet. Check auto-capture in Razorpay, then re-verify.", action: { kind: "reverify_payment", id: String(p.id), label: "Re-verify with Razorpay" } });
        else out.push({ level: "info", text: `Order ${p.provider_order_id} is open; no captured payment is recorded. If the customer says they paid, re-verify.`, action: { kind: "reverify_payment", id: String(p.id), label: "Re-verify with Razorpay" } });
      }
    }
    if (verified.some(p => p.provider === "razorpay")) out.push({ level: "problem", text: "A verified online payment exists but the booking is still pending. Re-process its webhook or re-verify.", action: { kind: "reverify_payment", id: String(verified.find(p => p.provider === "razorpay")!.id), label: "Re-verify with Razorpay" } });
  }
  if ((status === "CONFIRMED" || status === "COMPLETED") && advance > 0 && !verified.length) out.push({ level: "problem", text: "Confirmed with an advance due but no verified payment (consistency check failure). Look at the events for who confirmed it." });
  if (status === "CONFIRMED" && new Date(String(booking.ends_at)) < now) out.push({ level: "info", text: "The booking has ended; the vendor has not marked it completed yet." });
  if (status === "EXPIRED" && verified.length) out.push({ level: "problem", text: "Expired but a payment was verified: a late payment. It should have been re-claimed or refunded; re-verify to apply the late-payment rule.", action: { kind: "reverify_payment", id: String(verified[0].id), label: "Re-verify with Razorpay" } });
  if (status === "EXPIRED_PAID" && !refunds.some(r => r.status === "pending" || r.status === "processed")) out.push({ level: "problem", text: "Paid after expiry and no refund is pending or processed. Refund it from the Razorpay dashboard and note it here." });
  for (const r of refunds.filter(r => r.status === "failed")) out.push({ level: "problem", text: `Refund of ${formatINR(Number(r.amount_paise))} failed: ${r.error ?? "unknown error"}. Issue it from the Razorpay dashboard; the refund.processed webhook will record it.` });
  for (const r of refunds.filter(r => r.status === "pending" && !r.provider_refund_id)) out.push({ level: "warning", text: `Refund of ${formatINR(Number(r.amount_paise))} was never sent to Razorpay.` });
  for (const r of refunds.filter(r => r.status === "manual")) out.push({ level: "info", text: `${formatINR(Number(r.amount_paise))} was paid offline; the vendor returns it directly.` });
  for (const w of webhooks.filter(w => w.needs_review)) out.push({ level: "problem", text: `Webhook ${w.type} (${w.event_id}) needs review: ${w.error ?? "no error recorded"}.`, action: { kind: "reprocess_webhook", id: String(w.event_id), label: "Process it again" } });
  for (const w of webhooks.filter(w => !w.processed_at && !w.needs_review)) out.push({ level: "warning", text: `Webhook ${w.type} (${w.event_id}) is waiting: ${w.error ?? "not processed yet"}.`, action: { kind: "reprocess_webhook", id: String(w.event_id), label: "Process it now" } });
  for (const e of outbox.filter(e => e.status === "failed")) out.push({ level: "warning", text: `Email "${e.template}" to ${e.recipient} failed after ${e.attempts} attempts: ${e.last_error ?? "unknown error"}.`, action: { kind: "retry_email", id: String(e.id), label: "Retry this email" } });
  for (const e of outbox.filter(e => e.status === "queued" && Number(e.attempts) > 0)) out.push({ level: "info", text: `Email "${e.template}" is retrying (attempt ${e.attempts}): ${e.last_error ?? ""}` });
  return out.length ? out : [{ level: "ok", text: `Nothing looks stuck. Status ${status}.` }];
}

adminRouter.get("/payments", handle(async (req, res) => {
  const { q, status } = searchSchema.parse(req.query);
  const rows = (await pool.query(`SELECT p.id,p.booking_id,p.provider,p.kind,p.status,p.amount_paise::int AS amount_paise,p.provider_order_id,p.provider_payment_id,p.method,p.created_at,p.verified_at,b.client_email::text AS client_email,v.slug::text AS vendor_slug
    FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN vendors v ON v.id=b.vendor_id
    WHERE ($1::text IS NULL OR p.provider_order_id=$2 OR p.provider_payment_id=$2 OR b.client_email::text ILIKE $1 OR p.booking_id::text=$2) AND ($3::text IS NULL OR p.status=$3) ORDER BY p.created_at DESC LIMIT ${PAGE}`, [q ? like(q) : null, q ?? null, status ?? null])).rows;
  await audited(res, "admin.view", "payments", "list", { q: q ?? null, count: rows.length });
  res.json({ payments: rows });
}));
adminRouter.get("/webhooks", handle(async (req, res) => {
  const { status } = searchSchema.parse(req.query);
  const filter = status === "review" ? "WHERE needs_review" : status === "waiting" ? "WHERE processed_at IS NULL AND NOT needs_review" : "";
  const rows = (await pool.query(`SELECT event_id,type,received_at,processed_at,error,needs_review,payload #>> '{payload,payment,entity,order_id}' AS order_id FROM webhook_events ${filter} ORDER BY received_at DESC LIMIT ${PAGE}`)).rows;
  await audited(res, "admin.view", "webhooks", "list", { status: status ?? null, count: rows.length });
  res.json({ webhooks: rows });
}));
adminRouter.get("/webhooks/:id", handle(async (req, res) => {
  const id = z.string().min(1).max(200).parse(req.params.id);
  const row = (await pool.query("SELECT event_id,type,received_at,processed_at,error,needs_review,payload FROM webhook_events WHERE event_id=$1", [id])).rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Webhook not found");
  await audited(res, "admin.view", "webhook", id);
  res.json(row);
}));
adminRouter.get("/outbox", handle(async (req, res) => {
  const { q, status } = searchSchema.parse(req.query);
  // Bodies are not listed (they may hold personal details); OTP bodies are already removed after sending.
  const rows = (await pool.query(`SELECT id,booking_id,template,recipient::text AS recipient,subject,status,priority,attempts,last_error,next_attempt_at,sent_at,failed_at,created_at FROM email_outbox
    WHERE ($1::text IS NULL OR recipient::text ILIKE $1) AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT ${PAGE}`, [q ? like(q) : null, status ?? null])).rows;
  await audited(res, "admin.view", "outbox", "list", { q: q ?? null, status: status ?? null, count: rows.length });
  res.json({ emails: rows });
}));
adminRouter.get("/job-runs", handle(async (req, res) => {
  const { status } = searchSchema.parse(req.query);
  const rows = (await pool.query(`SELECT id,job,trigger,started_at,finished_at,status,details,error FROM job_runs WHERE ($1::text IS NULL OR status=$1) ORDER BY started_at DESC LIMIT 100`, [status ?? null])).rows;
  await audited(res, "admin.view", "job_runs", "list", { status: status ?? null });
  res.json({ runs: rows });
}));
adminRouter.get("/audit", handle(async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const rows = (await pool.query(`SELECT a.id,a.action,a.resource_type,a.resource_id,a.metadata,a.created_at,u.email::text AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE ($1::text IS NULL OR a.resource_id=$1 OR a.action ILIKE $2 OR u.email::text ILIKE $2) ORDER BY a.created_at DESC LIMIT 100`, [q ?? null, q ? like(q) : null])).rows;
  await audited(res, "admin.view", "audit_logs", "list", { q: q ?? null });
  res.json({ entries: rows });
}));

// ---- Actions (AD-02) ----------------------------------------------------------------------------------------------
/** Asks the gateway what really happened to this payment and applies it through the normal capture path (PY-05, SPEC 11.4). */
adminRouter.post("/payments/:id/reverify", handle(async (req, res) => {
  const id = uuid(req.params.id);
  const row = (await pool.query<{ booking_id: string; provider: string; provider_order_id: string | null; provider_payment_id: string | null; created_at: Date }>("SELECT booking_id,provider,provider_order_id,provider_payment_id,created_at FROM payments WHERE id=$1", [id])).rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment not found");
  if (row.provider !== "razorpay" || !row.provider_order_id) throw new AppError(409, "NOT_ONLINE", "Only online payments can be re-verified with Razorpay.");
  if (!paymentsEnabled()) throw new AppError(409, "PAYMENTS_DISABLED", "Online payments are off (PAYMENT_MODE=disabled).");
  const provider = paymentProvider();
  const candidates = row.provider_payment_id ? [await provider.fetchPayment(row.provider_payment_id)]
    : (await provider.listPayments(Math.floor(row.created_at.getTime() / 1000) - 3600, Math.floor(Date.now() / 1000))).filter(payment => payment.order_id === row.provider_order_id);
  const captured = candidates.find(payment => payment.status === "captured" || payment.status === "refunded");
  let outcome: string;
  if (captured) outcome = (await applyCapturedPayment(row.provider_order_id, captured, "webhook")).outcome;
  else if (candidates.some(payment => payment.status === "authorized")) { await markOpenPayment(row.provider_order_id, "authorized", candidates.find(payment => payment.status === "authorized")!); outcome = "authorized_not_captured"; }
  else if (candidates.some(payment => payment.status === "failed")) { await markOpenPayment(row.provider_order_id, "failed", candidates.find(payment => payment.status === "failed")!); outcome = "failed"; }
  else outcome = "no_payment_found";
  await writeAudit(pool, adminOf(res).id, "admin.payment_reverified", "booking", row.booking_id, { payment_id: id, outcome, provider_statuses: candidates.map(payment => payment.status) });
  res.json({ outcome, provider_payments: candidates.map(payment => ({ id: payment.id, status: payment.status, amount: payment.amount })) });
}));
adminRouter.post("/webhooks/:id/reprocess", handle(async (req, res) => {
  const id = z.string().min(1).max(200).parse(req.params.id);
  const reset = await pool.query("UPDATE webhook_events SET processed_at=NULL,needs_review=false,error=NULL WHERE event_id=$1 AND (processed_at IS NULL OR needs_review) RETURNING event_id", [id]);
  if (!reset.rowCount) throw new AppError(409, "ALREADY_PROCESSED", "That webhook was already applied.");
  await processWebhookEvent(id);
  const after = (await pool.query("SELECT processed_at,needs_review,error FROM webhook_events WHERE event_id=$1", [id])).rows[0];
  await writeAudit(pool, adminOf(res).id, "admin.webhook_reprocessed", "webhook", id, { processed: Boolean(after.processed_at), needs_review: after.needs_review });
  res.json(after);
}));
adminRouter.post("/outbox/:id/retry", handle(async (req, res) => {
  const id = uuid(req.params.id);
  const retried = await pool.query<{ booking_id: string | null }>("UPDATE email_outbox SET status='queued',attempts=0,next_attempt_at=now(),failed_at=NULL,locked_until=NULL WHERE id=$1 AND status='failed' AND body_purged_at IS NULL RETURNING booking_id", [id]);
  if (!retried.rowCount) throw new AppError(409, "NOT_RETRYABLE", "Only failed emails whose content is still stored can be retried.");
  await writeAudit(pool, adminOf(res).id, "admin.email_retried", retried.rows[0].booking_id ? "booking" : "email", retried.rows[0].booking_id ?? id, { outbox_id: id });
  const result = await sendOutbox({ limit: 10 });
  res.json({ queued: true, send: result });
}));
adminRouter.post("/jobs/:kind", handle(async (req, res) => {
  const kind = z.enum(["tick", "nightly"]).parse(req.params.kind);
  const result = kind === "tick" ? await runTick("manual") : await runNightly("manual");
  await writeAudit(pool, adminOf(res).id, "admin.job_run", "job", kind, { ok: result.ok });
  res.json(result);
}));
