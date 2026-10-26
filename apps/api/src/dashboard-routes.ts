import { createHash, randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { addLocalDays, bookingListQuerySchema, calendarQuerySchema, localDateOf, manualBookingSchema, missingPublishRequirements, notifyPrefsSchema, rescheduleSchema, vendorCancelSchema } from "@bayana/shared";
import type { SessionUser } from "./auth.js";
import { closeLogin } from "./privacy.js";
import { writeAudit } from "./audit.js";
import { perIp } from "./auth-routes.js";
import { bookingView } from "./booking-routes.js";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { AppError } from "./errors.js";
import { kickUrgent } from "./notifications/outbox.js";
import { paidSql } from "./payments/service.js";
import { paymentsEnabled } from "./payments/runtime.js";
import { checklistInput, requireVendor, type VendorRow } from "./vendor-routes.js";
import { vendorCancel, vendorComplete, vendorManualBooking, vendorReschedule } from "./vendor-bookings.js";

// Vendor dashboard (SPEC 5.3): home, calendar, bookings, payments, customers, settings, iCal feed. Every query is scoped to
// res.locals.vendor.id from the session (requireVendor), so another vendor's ids match nothing and answer 404.

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const vendorOf = (res: Response) => res.locals.vendor as VendorRow;
const userOf = (res: Response) => res.locals.user as SessionUser;
const actorOf = (res: Response) => ({ vendorId: vendorOf(res).id, userId: userOf(res).id });
const bookingId = (req: Request) => { const parsed = z.string().uuid().safeParse(req.params.id); if (!parsed.success) throw new AppError(404, "NOT_FOUND", "Booking not found"); return parsed.data; };
const PAGE_SIZE = 25;
/** A lapsed hold reads as expired before the lazy expiry or the tick has run (SPEC 10.2), as on the booking page. */
const displayStatus = "CASE WHEN b.status IN ('HELD','PENDING') AND b.hold_expires_at <= now() THEN 'EXPIRED' ELSE b.status END";
/** Local midnight of a local date in the vendor's timezone, as SQL. */
const localMidnight = (dateParam: string, tzParam: string) => `((${dateParam})::date::timestamp AT TIME ZONE ${tzParam})`;
export const icalTokenHash = (token: string) => createHash("sha256").update(`${config.SESSION_SECRET}:ical:${token}`).digest("hex");

export const dashboardRouter = Router();

// ---- Home ---------------------------------------------------------------------------------------------------------
dashboardRouter.get("/overview", requireVendor, handle(async (_req, res) => {
  const { id, timezone } = vendorOf(res);
  const today = `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`;
  const [upcoming, money, todo, checklist] = await Promise.all([
    pool.query(`SELECT b.id,${displayStatus} AS status,b.service_name,b.client_name,b.starts_at,b.ends_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.total_paise::int AS total_paise,${paidSql("b.id")}::int AS paid_paise FROM bookings b
      WHERE b.vendor_id=$1 AND b.starts_at >= ${today} AND b.starts_at < ${today} + interval '8 days' AND ${displayStatus} IN ('HELD','PENDING','CONFIRMED','COMPLETED') ORDER BY b.starts_at LIMIT 100`, [id, timezone]),
    pool.query<{ collected_30d: string; refunded_30d: string; balance_due: string }>(`SELECT
      COALESCE((SELECT SUM(p.amount_paise) FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.vendor_id=$1 AND p.verified_at > now() - interval '30 days' AND p.status IN ('captured','refunded','partially_refunded')),0) AS collected_30d,
      COALESCE((SELECT SUM(r.amount_paise) FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE b.vendor_id=$1 AND r.status='processed' AND r.processed_at > now() - interval '30 days'),0) AS refunded_30d,
      COALESCE((SELECT SUM(b.total_paise - ${paidSql("b.id")}) FROM bookings b WHERE b.vendor_id=$1 AND b.status IN ('PENDING','CONFIRMED') AND b.ends_at > now() AND (b.status='CONFIRMED' OR b.hold_expires_at IS NULL OR b.hold_expires_at > now())),0) AS balance_due`, [id]),
    pool.query<{ kind: string; id: string; client_name: string; starts_at: Date; amount_paise: string | null }>(`
      SELECT 'record_advance' AS kind,b.id,b.client_name,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.advance_paise AS amount_paise FROM bookings b WHERE b.vendor_id=$1 AND b.status='PENDING' AND b.hold_expires_at > now() AND b.advance_paise > ${paidSql("b.id")}
      UNION ALL SELECT 'mark_complete',b.id,b.client_name,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,NULL FROM bookings b WHERE b.vendor_id=$1 AND b.status='CONFIRMED' AND b.ends_at < now()
      UNION ALL SELECT 'return_money',b.id,b.client_name,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,r.amount_paise FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE b.vendor_id=$1 AND r.status='manual' AND r.created_at > now() - interval '60 days'
      UNION ALL SELECT 'refund_failed',b.id,b.client_name,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,r.amount_paise FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE b.vendor_id=$1 AND r.status='failed'
      ORDER BY starts_at LIMIT 50`, [id]),
    checklistInput(pool, id)
  ]);
  const m = money.rows[0];
  res.json({
    timezone, upcoming: upcoming.rows, payments_enabled: paymentsEnabled(),
    money: { collected_30d_paise: Number(m.collected_30d) - Number(m.refunded_30d), balance_due_paise: Number(m.balance_due) },
    todo: todo.rows.map(row => ({ ...row, amount_paise: row.amount_paise === null ? null : Number(row.amount_paise) })),
    publish_missing: missingPublishRequirements(checklist), published: checklist.published
  });
}));

// ---- Bookings -----------------------------------------------------------------------------------------------------
dashboardRouter.get("/bookings", requireVendor, handle(async (req, res) => {
  const query = bookingListQuerySchema.parse(req.query); const { id, timezone } = vendorOf(res);
  const params: unknown[] = [id]; const where = ["b.vendor_id=$1"];
  // The timezone is a parameter only when a date filter uses it (an unused parameter has no type and is rejected).
  let tz = ""; const tzRef = () => { if (!tz) { params.push(timezone); tz = `$${params.length}`; } return tz; };
  if (query.status) { params.push(query.status); where.push(`${displayStatus} = $${params.length}`); }
  if (query.q) { params.push(`%${query.q.replace(/[\\%_]/g, char => `\\${char}`)}%`); where.push(`(b.client_name ILIKE $${params.length} OR b.client_email::text ILIKE $${params.length} OR b.id::text ILIKE $${params.length})`); }
  if (query.from) { params.push(query.from); const date = `$${params.length}`; where.push(`b.starts_at >= ${localMidnight(date, tzRef())}`); }
  if (query.to) { params.push(query.to); const date = `$${params.length}`; where.push(`b.starts_at < ${localMidnight(date, tzRef())} + interval '1 day'`); }
  params.push(PAGE_SIZE + 1, (query.page - 1) * PAGE_SIZE);
  const rows = (await pool.query(`SELECT b.id,${displayStatus} AS status,b.service_name,b.client_name,b.client_email::text AS client_email,b.starts_at,b.ends_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.total_paise::int AS total_paise,b.advance_paise::int AS advance_paise,${paidSql("b.id")}::int AS paid_paise,b.created_at
    FROM bookings b WHERE ${where.join(" AND ")} ORDER BY b.starts_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  res.json({ timezone, bookings: rows.slice(0, PAGE_SIZE), page: query.page, has_more: rows.length > PAGE_SIZE });
}));

dashboardRouter.get("/bookings/:id", requireVendor, handle(async (req, res) => {
  const id = bookingId(req);
  const owned = await pool.query<{ client_email: string; client_phone: string; customer_notes: string | null; referral: string | null; created_at: Date }>("SELECT client_email::text AS client_email,client_phone,customer_notes,referral,created_at FROM bookings WHERE id=$1 AND vendor_id=$2", [id, vendorOf(res).id]);
  if (!owned.rowCount) throw new AppError(404, "NOT_FOUND", "Booking not found");
  const [view, events, ledger] = await Promise.all([
    bookingView(id, true),
    pool.query("SELECT from_status,to_status,actor,reason,meta,created_at FROM booking_events WHERE booking_id=$1 ORDER BY created_at", [id]),
    pool.query("SELECT kind,amount_paise::int AS amount_paise,channel,actor,reason,created_at FROM ledger_entries WHERE booking_id=$1 ORDER BY created_at", [id])
  ]);
  const ended = new Date(view.ends_at) < new Date(), started = new Date(view.starts_at) <= new Date();
  res.json({
    ...view, customer: { name: view.client_name, email: owned.rows[0].client_email, phone: owned.rows[0].client_phone, notes: owned.rows[0].customer_notes, referral: owned.rows[0].referral }, created_at: owned.rows[0].created_at,
    events: events.rows, ledger: ledger.rows,
    actions: { cancel: ["PENDING", "CONFIRMED"].includes(view.status), complete: view.status === "CONFIRMED" && ended, reschedule: ["PENDING", "CONFIRMED"].includes(view.status) && !started, record_payment: ["PENDING", "CONFIRMED", "COMPLETED"].includes(view.status) && view.balance_due_paise > 0 }
  });
}));
dashboardRouter.post("/bookings/:id/cancel", requireVendor, handle(async (req, res) => {
  const body = vendorCancelSchema.parse(req.body); const id = bookingId(req);
  await vendorCancel(actorOf(res), id, body.reason);
  res.json(await bookingView(id, true)); kickUrgent();
}));
dashboardRouter.post("/bookings/:id/complete", requireVendor, handle(async (req, res) => {
  const id = bookingId(req); await vendorComplete(actorOf(res), id);
  res.json(await bookingView(id, true));
}));
dashboardRouter.post("/bookings/:id/reschedule", requireVendor, handle(async (req, res) => {
  const body = rescheduleSchema.parse(req.body); const id = bookingId(req);
  await vendorReschedule(actorOf(res), id, body.date, body.time);
  res.json(await bookingView(id, true)); kickUrgent();
}));
dashboardRouter.post("/bookings", requireVendor, handle(async (req, res) => {
  const body = manualBookingSchema.parse(req.body);
  const key = req.header("idempotency-key");
  if (!key || !z.string().uuid().safeParse(key).success) throw new AppError(400, "VALID_IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required");
  const created = await vendorManualBooking(actorOf(res), { serviceId: body.service_id, date: body.date, time: body.time, days: body.days, name: body.name, email: body.email, phone: body.phone, notes: body.notes, key });
  res.status(created.replayed ? 200 : 201).json(await bookingView(created.id, true)); kickUrgent();
}));

// ---- Calendar -----------------------------------------------------------------------------------------------------
dashboardRouter.get("/calendar", requireVendor, handle(async (req, res) => {
  const query = calendarQuerySchema.parse(req.query); const { id, timezone } = vendorOf(res);
  if ((new Date(query.to).getTime() - new Date(query.from).getTime()) / 86_400_000 > 62) throw new AppError(400, "VALIDATION_ERROR", "Show at most two months at a time.");
  const range = [id, timezone, query.from, query.to];
  const windowStart = localMidnight("$3", "$2"), windowEnd = `${localMidnight("$4", "$2")} + interval '1 day'`;
  const [bookings, blocked] = await Promise.all([
    pool.query(`SELECT b.id,${displayStatus} AS status,b.service_name,b.client_name,b.starts_at,b.ends_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date FROM bookings b WHERE b.vendor_id=$1 AND b.ends_at > ${windowStart} AND b.starts_at < ${windowEnd} AND ${displayStatus} IN ('HELD','PENDING','CONFIRMED','COMPLETED') ORDER BY b.starts_at`, range),
    pool.query(`SELECT id,starts_at,ends_at,reason FROM blocked_periods WHERE vendor_id=$1 AND tstzrange(starts_at,ends_at,'[)') && tstzrange(${windowStart},${windowEnd},'[)') ORDER BY starts_at`, range)
  ]);
  res.json({ timezone, from: query.from, to: query.to, bookings: bookings.rows, blocked_periods: blocked.rows });
}));

// ---- Payments and customers ---------------------------------------------------------------------------------------
dashboardRouter.get("/payments", requireVendor, handle(async (_req, res) => {
  const { id } = vendorOf(res);
  const [payments, refunds, due] = await Promise.all([
    pool.query(`SELECT p.id,p.booking_id,p.provider,p.kind,p.status,p.amount_paise::int AS amount_paise,p.method,p.created_at,p.verified_at,b.client_name,b.service_name FROM payments p JOIN bookings b ON b.id=p.booking_id
      WHERE b.vendor_id=$1 AND (p.verified_at IS NOT NULL OR p.status IN ('authorized','failed')) ORDER BY p.created_at DESC LIMIT 200`, [id]),
    pool.query("SELECT r.id,r.booking_id,r.amount_paise::int AS amount_paise,r.status,r.reason,r.created_at,r.processed_at,b.client_name FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE b.vendor_id=$1 ORDER BY r.created_at DESC LIMIT 200", [id]),
    pool.query(`SELECT b.id,b.client_name,b.service_name,b.starts_at,b.booking_mode,b.days_count,(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text AS first_date,b.status,(b.total_paise - ${paidSql("b.id")})::int AS balance_due_paise FROM bookings b WHERE b.vendor_id=$1 AND b.status IN ('CONFIRMED','COMPLETED') AND b.total_paise > ${paidSql("b.id")} ORDER BY b.starts_at LIMIT 200`, [id])
  ]);
  const sum = (rows: { amount_paise: number }[]) => rows.reduce((total, row) => total + row.amount_paise, 0);
  const verified = payments.rows.filter(row => row.verified_at);
  res.json({
    timezone: vendorOf(res).timezone,
    summary: { received_paise: sum(verified), online_paise: sum(verified.filter(row => row.provider === "razorpay")), offline_paise: sum(verified.filter(row => row.provider === "offline")), refunded_paise: sum(refunds.rows.filter(row => row.status === "processed")), owed_by_you_paise: sum(refunds.rows.filter(row => row.status === "manual")), balance_due_paise: due.rows.reduce((total, row) => total + row.balance_due_paise, 0) },
    // Online advances settle to the vendor's own Razorpay account; Bayana never holds the money (SPEC 11.6).
    payout: { mode: paymentsEnabled() ? "razorpay_direct" : "offline_only" },
    payments: payments.rows, refunds: refunds.rows, balances_due: due.rows
  });
}));

dashboardRouter.get("/customers", requireVendor, handle(async (req, res) => {
  const q = z.string().trim().max(120).optional().parse(req.query.q);
  const params: unknown[] = [vendorOf(res).id];
  if (q) params.push(`%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`);
  const rows = (await pool.query(`SELECT lower(b.client_email::text) AS email,(array_agg(b.client_name ORDER BY b.created_at DESC))[1] AS name,(array_agg(NULLIF(b.client_phone,'') ORDER BY b.created_at DESC))[1] AS phone,
      count(*)::int AS bookings,COALESCE(SUM(${paidSql("b.id")}),0)::int AS paid_paise,max(b.starts_at) AS last_starts_at,
      json_agg(json_build_object('id',b.id,'status',${displayStatus},'service_name',b.service_name,'starts_at',b.starts_at,'booking_mode',b.booking_mode,'days_count',b.days_count,'first_date',(b.starts_at AT TIME ZONE b.vendor_timezone)::date::text,'total_paise',b.total_paise) ORDER BY b.starts_at DESC) AS history
    FROM bookings b WHERE b.vendor_id=$1 AND b.status NOT IN ('HELD','EXPIRED') ${q ? "AND (b.client_name ILIKE $2 OR b.client_email::text ILIKE $2)" : ""}
    GROUP BY lower(b.client_email::text) ORDER BY max(b.starts_at) DESC LIMIT 200`, params)).rows;
  res.json({ timezone: vendorOf(res).timezone, customers: rows });
}));

// ---- Settings -----------------------------------------------------------------------------------------------------
dashboardRouter.get("/settings", requireVendor, handle(async (_req, res) => {
  const row = (await pool.query<{ notify_prefs: Record<string, boolean>; ical: boolean }>("SELECT notify_prefs,ical_token_hash IS NOT NULL AS ical FROM vendors WHERE id=$1", [vendorOf(res).id])).rows[0];
  res.json({ notify_prefs: { booking_confirmed: true, booking_cancelled: true, reminder_24h: true, ...row.notify_prefs }, ical_enabled: row.ical, account_email: userOf(res).email });
}));
dashboardRouter.put("/settings/notifications", requireVendor, handle(async (req, res) => {
  const prefs = notifyPrefsSchema.parse(req.body);
  await pool.query("UPDATE vendors SET notify_prefs=$2 WHERE id=$1", [vendorOf(res).id, JSON.stringify(prefs)]);
  res.json({ notify_prefs: prefs });
}));
/** A new secret feed address; the old one stops working. Only the hash is stored, so the address is shown once. */
dashboardRouter.post("/settings/ical", requireVendor, handle(async (_req, res) => {
  const token = randomBytes(32).toString("base64url");
  await pool.query("UPDATE vendors SET ical_token_hash=$2 WHERE id=$1", [vendorOf(res).id, icalTokenHash(token)]);
  res.status(201).json({ path: `/v1/ical/${token}.ics` });
}));
dashboardRouter.delete("/settings/ical", requireVendor, handle(async (_req, res) => {
  await pool.query("UPDATE vendors SET ical_token_hash=NULL WHERE id=$1", [vendorOf(res).id]); res.status(204).end();
}));

/** PV-02: everything about the business and its bookings as JSON. */
dashboardRouter.get("/export", requireVendor, handle(async (_req, res) => {
  const { id } = vendorOf(res);
  const [profile, services, rules, overrides, blocked, bookings, events, payments, refunds] = await Promise.all([
    pool.query("SELECT slug::text AS slug,display_name,bio,city,service_area,timezone,terms,cancellation_policy,rescheduling_policy,published,created_at FROM vendors WHERE id=$1", [id]),
    pool.query("SELECT id,name,description,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,advance_type,advance_value,cancellation_tiers,terms_template,active FROM services WHERE vendor_id=$1 ORDER BY sort_order", [id]),
    pool.query("SELECT weekday,start_time::text,end_time::text FROM availability_rules WHERE vendor_id=$1 ORDER BY weekday,start_time", [id]),
    pool.query("SELECT local_date::text,kind,start_time::text,end_time::text,note FROM availability_overrides WHERE vendor_id=$1 ORDER BY local_date", [id]),
    pool.query("SELECT starts_at,ends_at,reason FROM blocked_periods WHERE vendor_id=$1 ORDER BY starts_at", [id]),
    pool.query("SELECT id,status,service_name,client_name,client_email::text AS client_email,client_phone,customer_notes,starts_at,ends_at,booking_mode,days_count,(starts_at AT TIME ZONE vendor_timezone)::date::text AS first_date,total_paise,advance_paise,created_at FROM bookings WHERE vendor_id=$1 ORDER BY starts_at", [id]),
    pool.query("SELECT e.booking_id,e.from_status,e.to_status,e.actor,e.reason,e.created_at FROM booking_events e JOIN bookings b ON b.id=e.booking_id WHERE b.vendor_id=$1 ORDER BY e.created_at", [id]),
    pool.query("SELECT p.booking_id,p.provider,p.kind,p.status,p.amount_paise,p.method,p.created_at,p.verified_at FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.vendor_id=$1 ORDER BY p.created_at", [id]),
    pool.query("SELECT r.booking_id,r.amount_paise,r.status,r.reason,r.created_at,r.processed_at FROM refunds r JOIN bookings b ON b.id=r.booking_id WHERE b.vendor_id=$1 ORDER BY r.created_at", [id])
  ]);
  await writeAudit(pool, userOf(res).id, "vendor.data_exported", "vendor", id);
  res.set({ "Content-Disposition": `attachment; filename="bayana-export-${profile.rows[0].slug}.json"`, "Cache-Control": "private, no-store" })
    .json({ exported_at: new Date().toISOString(), account: { email: userOf(res).email }, profile: profile.rows[0], services: services.rows, availability: { weekly: rules.rows, overrides: overrides.rows, time_off: blocked.rows }, bookings: bookings.rows, booking_events: events.rows, payments: payments.rows, refunds: refunds.rows });
}));

/**
 * PV-02: closes the account. Refused while any booking is still ahead. The page goes offline, sessions end and the login
 * email and password are removed; bookings, payments and refunds stay (financial records), and the page address is not reused.
 */
dashboardRouter.post("/account/delete", requireVendor, handle(async (req, res) => {
  const { confirm_slug } = z.object({ confirm_slug: z.string() }).strict().parse(req.body);
  const vendor = vendorOf(res), user = userOf(res);
  if (confirm_slug !== vendor.slug) throw new AppError(400, "CONFIRMATION_MISMATCH", "Type your page address exactly to confirm.");
  await transaction(async db => {
    const active = await db.query("SELECT 1 FROM bookings WHERE vendor_id=$1 AND status IN ('PENDING','CONFIRMED') AND ends_at > now() AND (status='CONFIRMED' OR hold_expires_at IS NULL OR hold_expires_at > now()) LIMIT 1", [vendor.id]);
    if (active.rowCount) throw new AppError(409, "ACTIVE_BOOKINGS", "You still have upcoming bookings. Cancel or complete them first, then delete your account.");
    await db.query("UPDATE vendors SET published=false,bookings_enabled=false,ical_token_hash=NULL,public_contact_email=false,public_contact_phone=false WHERE id=$1", [vendor.id]);
    await closeLogin(db, user);
    await writeAudit(db, user.id, "account.deleted", "user", user.id, { vendor_id: vendor.id });
  });
  res.status(204).end();
}));

// ---- iCal feed (SPEC 5.3): a secret URL calendar apps poll. Wrong or revoked tokens are a plain 404. ----------------
const icsStamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/[;,]/g, char => `\\${char}`).replace(/\r?\n/g, "\\n");
/** RFC 5545 lines are at most 75 octets; longer ones continue on the next line after a space. */
const fold = (line: string) => { const out: string[] = []; let rest = Buffer.from(line); while (rest.length > 75) { let cut = 75; while ((rest[cut] & 0xc0) === 0x80) cut--; out.push(rest.subarray(0, cut).toString()); rest = Buffer.concat([Buffer.from(" "), rest.subarray(cut)]); } out.push(rest.toString()); return out.join("\r\n"); };

export const icalRouter = Router();
/**
 * Hourly bookings are timed events. Daily bookings are all-day events on their local dates (RFC 5545 VALUE=DATE), and DTEND is
 * the day AFTER the last day: an all-day end date is exclusive.
 */
function icsWhen(booking: { starts_at: Date; ends_at: Date; booking_mode: string; days_count: number | null; vendor_timezone: string }) {
  if (booking.booking_mode !== "daily" || !booking.days_count) return [`DTSTART:${icsStamp(booking.starts_at)}`, `DTEND:${icsStamp(booking.ends_at)}`];
  const first = localDateOf(booking.starts_at, booking.vendor_timezone), compact = (date: string) => date.replaceAll("-", "");
  return [`DTSTART;VALUE=DATE:${compact(first)}`, `DTEND;VALUE=DATE:${compact(addLocalDays(first, booking.days_count))}`];
}
icalRouter.get("/:file", perIp(60), handle(async (req, res) => {
  const token = /^([A-Za-z0-9_-]{43})\.ics$/.exec(String(req.params.file))?.[1];
  const vendor = token ? (await pool.query<{ id: string; display_name: string }>("SELECT id,display_name FROM vendors WHERE ical_token_hash=$1", [icalTokenHash(token)])).rows[0] : undefined;
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Not found");
  const bookings = await pool.query<{ id: string; status: string; service_name: string | null; client_name: string; starts_at: Date; ends_at: Date; created_at: Date; booking_mode: string; days_count: number | null; vendor_timezone: string }>(
    "SELECT id,status,service_name,client_name,starts_at,ends_at,created_at,booking_mode,days_count,vendor_timezone FROM bookings WHERE vendor_id=$1 AND status IN ('PENDING','CONFIRMED','COMPLETED') AND (status<>'PENDING' OR hold_expires_at IS NULL OR hold_expires_at > now()) AND ends_at > now() - interval '30 days' AND starts_at < now() + interval '400 days' ORDER BY starts_at", [vendor.id]);
  const dashboard = `${config.WEB_ORIGINS[0]}/dashboard/bookings`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bayana//Bookings//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(`${vendor.display_name} (Bayana)`)}`,
    ...bookings.rows.flatMap(booking => ["BEGIN:VEVENT", `UID:${booking.id}@bayana`, `DTSTAMP:${icsStamp(booking.created_at)}`, ...icsWhen(booking),
      `SUMMARY:${icsText(`${booking.service_name ?? "Booking"}: ${booking.client_name}${booking.status === "PENDING" ? " (awaiting advance)" : ""}`)}`, `STATUS:${booking.status === "PENDING" ? "TENTATIVE" : "CONFIRMED"}`, `URL:${dashboard}/${booking.id}`, "END:VEVENT"]),
    "END:VCALENDAR"];
  res.set({ "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" }).send(`${lines.map(fold).join("\r\n")}\r\n`);
}));
