import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  blockedPeriodSchema, bookingWindowSchema, missingPublishRequirements, onboardingSteps, overrideSchema, serviceCreateSchema, serviceReorderSchema, serviceUpdateSchema,
  vendorCreateSchema, vendorProfileSchema, weeklyScheduleSchema, weeklyWindowSchema, type ChecklistInput, type ServiceInput
} from "@bayana/shared";
import { currentUser, type SessionUser } from "./auth.js";
import { cookieToken } from "./auth-routes.js";
import { pool, transaction } from "./database.js";
import { expireOverdueHolds, lockVendorSchedule } from "./booking-transition.js";
import { AppError } from "./errors.js";
import { kickUrgent } from "./notifications/outbox.js";
import { recordOfflinePayment } from "./payments/service.js";

export type VendorRow = { id: string; slug: string; owner_user_id: string; published: boolean; timezone: string };
const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`);
const uuidParam = (value: unknown, what: string) => { const parsed = z.string().uuid().safeParse(value); if (!parsed.success) throw notFound(what); return parsed.data; };
const userOf = (res: Response) => res.locals.user as SessionUser;
const vendorOf = (res: Response) => res.locals.vendor as VendorRow;
type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Signed-in vendor account (no business profile needed yet). */
export async function requireVendorUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await currentUser(pool, cookieToken(req));
    if (!user || user.role !== "VENDOR") throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in with a vendor account to continue");
    res.locals.user = user; next();
  } catch (error) { next(error); }
}
/**
 * The single ownership check: resolves the caller's own vendor from their session. Every vendor route reads and writes
 * through res.locals.vendor.id, so an id belonging to another vendor simply matches no row (404), never someone else's data.
 */
export async function requireVendor(req: Request, res: Response, next: NextFunction) {
  requireVendorUser(req, res, async error => {
    if (error) return next(error);
    try {
      const vendor = await pool.query<VendorRow>("SELECT id,slug::text AS slug,owner_user_id,published,timezone FROM vendors WHERE owner_user_id=$1", [userOf(res).id]);
      if (!vendor.rowCount) throw new AppError(404, "PROFILE_NOT_FOUND", "Create your business profile first");
      res.locals.vendor = vendor.rows[0]; next();
    } catch (failure) { next(failure); }
  });
}

/** Facts the publish checklist and the onboarding steps are computed from. */
export async function checklistInput(db: Pool | PoolClient, vendorId: string): Promise<ChecklistInput> {
  const row = (await db.query(`SELECT v.slug::text AS slug, v.display_name, v.bio, v.terms, v.cancellation_policy, v.rescheduling_policy, v.published,
      EXISTS(SELECT 1 FROM services s WHERE s.vendor_id=v.id AND s.active) AS has_service,
      NOT EXISTS(SELECT 1 FROM services s WHERE s.vendor_id=v.id AND s.active AND ((s.advance_type='NONE' AND s.advance_value<>0) OR (s.advance_type='PERCENT' AND s.advance_value NOT BETWEEN 1 AND 100) OR (s.advance_type='FIXED' AND (s.advance_value<1 OR s.advance_value>s.price_paise)))) AS has_valid_advance_rule,
      (EXISTS(SELECT 1 FROM availability_rules r WHERE r.vendor_id=v.id) OR EXISTS(SELECT 1 FROM availability_overrides o WHERE o.vendor_id=v.id AND o.kind='open' AND o.local_date >= current_date)) AS has_availability
    FROM vendors v WHERE v.id=$1`, [vendorId])).rows[0];
  return { slug: row.slug, published: row.published, hasService: row.has_service, hasValidAdvanceRule: row.has_valid_advance_rule, hasAvailability: row.has_availability, businessName: row.display_name, description: row.bio, terms: row.terms, cancellationPolicy: row.cancellation_policy, reschedulingPolicy: row.rescheduling_policy };
}

/** A slug is taken if another vendor uses it now or used it before (old links keep redirecting to their owner). */
async function assertSlugFree(db: Pool | PoolClient, slug: string, vendorId: string | null) {
  const taken = await db.query("SELECT 1 FROM vendors WHERE slug=$1 AND id IS DISTINCT FROM $2 UNION ALL SELECT 1 FROM vendor_slug_history WHERE slug=$1 AND vendor_id IS DISTINCT FROM $2 LIMIT 1", [slug, vendorId]);
  if (taken.rowCount) throw new AppError(409, "SLUG_TAKEN", "That address is already in use. Try another.");
}
const serviceColumns = "id,name,description,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,buffer_days,advance_type,advance_value,cancellation_tiers,terms_template,customer_details_prompt,active,sort_order,created_at";
const profileColumns = "id,slug::text AS slug,display_name AS business_name,bio AS description,city,service_area,timezone,terms,cancellation_policy,rescheduling_policy,phone_required,public_contact_email,public_contact_phone,published,min_notice_minutes,max_advance_days";

export const vendorRouter = Router();

// ---- Profile ----------------------------------------------------------------------------------------------
vendorRouter.post("/me", requireVendorUser, handle(async (req, res) => {
  const body = vendorCreateSchema.parse(req.body);
  const created = await transaction(async db => {
    await assertSlugFree(db, body.slug, null);
    const vendor = await db.query(`INSERT INTO vendors(id,owner_user_id,slug,display_name,city,bio,timezone,base_price_paise,advance_type,advance_value,bookings_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,100,'PERCENT',1,false) ON CONFLICT(owner_user_id) DO NOTHING RETURNING ${profileColumns}`, [randomUUID(), userOf(res).id, body.slug, body.business_name, body.city, body.description, body.timezone]);
    if (!vendor.rowCount) throw new AppError(409, "PROFILE_EXISTS", "You already have a business profile");
    for (const category of body.categories) await db.query("INSERT INTO vendor_categories(vendor_id,category_slug) VALUES($1,$2)", [vendor.rows[0].id, category]);
    return vendor.rows[0];
  });
  res.status(201).json(created);
}));
vendorRouter.get("/me", requireVendor, handle(async (_req, res) => {
  const id = vendorOf(res).id;
  const [profile, categories, services] = await Promise.all([pool.query(`SELECT ${profileColumns} FROM vendors WHERE id=$1`, [id]), pool.query("SELECT category_slug FROM vendor_categories WHERE vendor_id=$1 ORDER BY category_slug", [id]), pool.query(`SELECT ${serviceColumns} FROM services WHERE vendor_id=$1 ORDER BY sort_order,created_at`, [id])]);
  res.json({ ...profile.rows[0], categories: categories.rows.map(row => row.category_slug), services: services.rows });
}));
vendorRouter.patch("/me", requireVendor, handle(async (req, res) => {
  const body = vendorProfileSchema.parse(req.body); const vendor = vendorOf(res);
  const updated = await transaction(async db => {
    if (body.slug && body.slug !== vendor.slug) { await assertSlugFree(db, body.slug, vendor.id); await db.query("INSERT INTO vendor_slug_history(slug,vendor_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [vendor.slug, vendor.id]); }
    const result = await db.query(`UPDATE vendors SET slug=COALESCE($1,slug),display_name=COALESCE($2,display_name),bio=COALESCE($3,bio),city=COALESCE($4,city),service_area=CASE WHEN $5::boolean THEN $6 ELSE service_area END,timezone=COALESCE($7,timezone),terms=COALESCE($8,terms),cancellation_policy=COALESCE($9,cancellation_policy),rescheduling_policy=COALESCE($10,rescheduling_policy),phone_required=COALESCE($11,phone_required),public_contact_email=COALESCE($12,public_contact_email),public_contact_phone=COALESCE($13,public_contact_phone) WHERE id=$14 RETURNING ${profileColumns}`,
      [body.slug ?? null, body.business_name ?? null, body.description ?? null, body.city ?? null, "service_area" in body, body.service_area ?? null, body.timezone ?? null, body.terms ?? null, body.cancellation_policy ?? null, body.rescheduling_policy ?? null, body.phone_required ?? null, body.public_contact_email ?? null, body.public_contact_phone ?? null, vendor.id]);
    if (body.categories) { await db.query("DELETE FROM vendor_categories WHERE vendor_id=$1", [vendor.id]); for (const category of body.categories) await db.query("INSERT INTO vendor_categories(vendor_id,category_slug) VALUES($1,$2)", [vendor.id, category]); }
    return result.rows[0];
  });
  res.json(updated);
}));
vendorRouter.patch("/me/booking-window", requireVendor, handle(async (req, res) => {
  const body = bookingWindowSchema.parse(req.body);
  const result = await pool.query("UPDATE vendors SET min_notice_minutes=COALESCE($1,min_notice_minutes),max_advance_days=COALESCE($2,max_advance_days) WHERE id=$3 RETURNING min_notice_minutes,max_advance_days", [body.min_notice_minutes ?? null, body.max_advance_days ?? null, vendorOf(res).id]);
  res.json(result.rows[0]);
}));
vendorRouter.get("/checklist", requireVendor, handle(async (_req, res) => {
  const input = await checklistInput(pool, vendorOf(res).id);
  res.json({ published: input.published, steps: onboardingSteps(input), missing: missingPublishRequirements(input) });
}));

// ---- Services -----------------------------------------------------------------------------------------------
/** The mode's own columns; the other mode's are stored as NULL (services_mode_fields enforces the same). */
const modeColumns = (service: ServiceInput) => service.booking_mode === "daily"
  ? { duration_minutes: null, buffer_before_minutes: null, buffer_after_minutes: null, min_days: service.min_days, max_days: service.max_days, buffer_days: service.buffer_days }
  : { duration_minutes: service.duration_minutes, buffer_before_minutes: service.buffer_before_minutes, buffer_after_minutes: service.buffer_after_minutes, min_days: null, max_days: null, buffer_days: null };
vendorRouter.get("/services", requireVendor, handle(async (_req, res) => { res.json({ services: (await pool.query(`SELECT ${serviceColumns} FROM services WHERE vendor_id=$1 ORDER BY sort_order,created_at`, [vendorOf(res).id])).rows }); }));
vendorRouter.post("/services", requireVendor, handle(async (req, res) => {
  const body = serviceCreateSchema.parse(req.body); const mode = modeColumns(body);
  const result = await pool.query(`INSERT INTO services(id,vendor_id,name,description,price_paise,duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,advance_type,advance_value,cancellation_tiers,terms_template,customer_details_prompt,active,min_days,max_days,buffer_days,sort_order)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,(SELECT COALESCE(MAX(sort_order)+1,0) FROM services WHERE vendor_id=$2)) RETURNING ${serviceColumns}`,
    [randomUUID(), vendorOf(res).id, body.name, body.description, body.price_paise, mode.duration_minutes, mode.buffer_before_minutes, mode.buffer_after_minutes, body.booking_mode, body.advance_type, body.advance_value, JSON.stringify(body.cancellation_tiers), body.terms_template, body.customer_details_prompt, body.active, mode.min_days, mode.max_days, mode.buffer_days]);
  res.status(201).json(result.rows[0]);
}));
vendorRouter.patch("/services/:id", requireVendor, handle(async (req, res) => {
  const id = uuidParam(req.params.id, "Service"); const patch = serviceUpdateSchema.parse(req.body);
  const existing = await pool.query(`SELECT ${serviceColumns} FROM services WHERE id=$1 AND vendor_id=$2`, [id, vendorOf(res).id]);
  if (!existing.rowCount) throw notFound("Service");
  const { id: _id, sort_order: _order, created_at: _created, ...stored } = existing.rows[0];
  // Switching mode drops the stored fields of the old mode; the patch supplies the new mode's (or their defaults).
  const switching = patch.booking_mode !== undefined && patch.booking_mode !== stored.booking_mode;
  const kept = switching ? Object.fromEntries(Object.entries(stored).filter(([key]) => !["duration_minutes", "buffer_before_minutes", "buffer_after_minutes", "min_days", "max_days", "buffer_days"].includes(key))) : stored;
  const merged = serviceCreateSchema.parse(Object.fromEntries(Object.entries({ ...kept, price_paise: Number(stored.price_paise), ...patch }).filter(([, value]) => value !== null)));
  const mode = modeColumns(merged);
  const result = await pool.query(`UPDATE services SET name=$1,description=$2,price_paise=$3,duration_minutes=$4,buffer_before_minutes=$5,buffer_after_minutes=$6,booking_mode=$7,advance_type=$8,advance_value=$9,cancellation_tiers=$10,terms_template=$11,customer_details_prompt=$12,active=$13,min_days=$16,max_days=$17,buffer_days=$18 WHERE id=$14 AND vendor_id=$15 RETURNING ${serviceColumns}`,
    [merged.name, merged.description, merged.price_paise, mode.duration_minutes, mode.buffer_before_minutes, mode.buffer_after_minutes, merged.booking_mode, merged.advance_type, merged.advance_value, JSON.stringify(merged.cancellation_tiers), merged.terms_template, merged.customer_details_prompt, merged.active, id, vendorOf(res).id, mode.min_days, mode.max_days, mode.buffer_days]);
  res.json(result.rows[0]);
}));
vendorRouter.delete("/services/:id", requireVendor, handle(async (req, res) => {
  const id = uuidParam(req.params.id, "Service");
  try {
    const result = await pool.query("DELETE FROM services WHERE id=$1 AND vendor_id=$2 RETURNING id", [id, vendorOf(res).id]);
    if (!result.rowCount) throw notFound("Service");
  } catch (error) {
    // Bookings keep a reference to the service they were made for; such a service can be hidden but not deleted.
    if ((error as { code?: string }).code === "23503") throw new AppError(409, "SERVICE_IN_USE", "This service has bookings. Turn it off instead of deleting it.");
    throw error;
  }
  res.status(204).end();
}));
vendorRouter.post("/services/reorder", requireVendor, handle(async (req, res) => {
  const { ids } = serviceReorderSchema.parse(req.body); const vendorId = vendorOf(res).id;
  if (new Set(ids).size !== ids.length) throw new AppError(400, "VALIDATION_ERROR", "Each service may appear once");
  await transaction(async db => {
    const owned = await db.query("SELECT id FROM services WHERE vendor_id=$1 AND id = ANY($2::uuid[])", [vendorId, ids]);
    if (owned.rowCount !== ids.length) throw notFound("Service");
    for (const [index, id] of ids.entries()) await db.query("UPDATE services SET sort_order=$1 WHERE id=$2 AND vendor_id=$3", [index, id, vendorId]);
  });
  res.status(204).end();
}));

// ---- Availability -----------------------------------------------------------------------------------------
vendorRouter.get("/availability", requireVendor, handle(async (_req, res) => {
  const id = vendorOf(res).id;
  const [settings, rules, overrides, blocked, bookings] = await Promise.all([
    pool.query("SELECT timezone,min_notice_minutes,max_advance_days FROM vendors WHERE id=$1", [id]),
    pool.query("SELECT id,weekday,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time FROM availability_rules WHERE vendor_id=$1 ORDER BY weekday,start_time", [id]),
    pool.query("SELECT id,local_date::text AS local_date,kind,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,note FROM availability_overrides WHERE vendor_id=$1 AND local_date >= current_date - 1 ORDER BY local_date,start_time NULLS FIRST", [id]),
    pool.query("SELECT id,starts_at,ends_at,reason FROM blocked_periods WHERE vendor_id=$1 AND ends_at>now() ORDER BY starts_at", [id]),
    pool.query("SELECT id,status,starts_at,ends_at,booking_mode,days_count,(starts_at AT TIME ZONE vendor_timezone)::date::text AS first_date,hold_expires_at FROM bookings WHERE vendor_id=$1 AND status IN ('HELD','PENDING','CONFIRMED') AND (status='CONFIRMED' OR hold_expires_at>now()) AND ends_at > now() ORDER BY starts_at", [id])
  ]);
  res.json({ ...settings.rows[0], rules: rules.rows, overrides: overrides.rows, blocked_periods: blocked.rows, bookings: bookings.rows });
}));
/** Replaces the whole weekly schedule atomically (the shared schema rejects overlapping windows). */
vendorRouter.put("/availability/rules", requireVendor, handle(async (req, res) => {
  const { windows } = weeklyScheduleSchema.parse(req.body); const id = vendorOf(res).id;
  const rules = await transaction(async db => {
    await db.query("DELETE FROM availability_rules WHERE vendor_id=$1", [id]);
    for (const window of windows) await db.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)", [randomUUID(), id, window.weekday, window.start_time, window.end_time]);
    return (await db.query("SELECT id,weekday,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time FROM availability_rules WHERE vendor_id=$1 ORDER BY weekday,start_time", [id])).rows;
  });
  res.json({ rules });
}));
vendorRouter.post("/availability/rules", requireVendor, handle(async (req, res) => {
  const body = weeklyWindowSchema.parse(req.body); const id = vendorOf(res).id;
  const rule = await transaction(async db => {
    await db.query("SELECT 1 FROM vendors WHERE id=$1 FOR UPDATE", [id]);
    const clash = await db.query("SELECT 1 FROM availability_rules WHERE vendor_id=$1 AND weekday=$2 AND start_time < $4::time AND end_time > $3::time", [id, body.weekday, body.start_time, body.end_time]);
    if (clash.rowCount) throw new AppError(409, "WINDOW_OVERLAP", "These hours overlap hours you already set for that day.");
    return (await db.query("INSERT INTO availability_rules(id,vendor_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5) RETURNING id,weekday,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time", [randomUUID(), id, body.weekday, body.start_time, body.end_time])).rows[0];
  });
  res.status(201).json(rule);
}));
vendorRouter.delete("/availability/rules/:id", requireVendor, handle(async (req, res) => {
  const result = await pool.query("DELETE FROM availability_rules WHERE id=$1 AND vendor_id=$2 RETURNING id", [uuidParam(req.params.id, "Availability rule"), vendorOf(res).id]);
  if (!result.rowCount) throw notFound("Availability rule");
  res.status(204).end();
}));
vendorRouter.post("/availability/overrides", requireVendor, handle(async (req, res) => {
  const body = overrideSchema.parse(req.body);
  const result = await pool.query("INSERT INTO availability_overrides(id,vendor_id,local_date,kind,start_time,end_time,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,local_date::text AS local_date,kind,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,note",
    [randomUUID(), vendorOf(res).id, body.local_date, body.kind, body.start_time, body.end_time, body.note]);
  res.status(201).json(result.rows[0]);
}));
vendorRouter.delete("/availability/overrides/:id", requireVendor, handle(async (req, res) => {
  const result = await pool.query("DELETE FROM availability_overrides WHERE id=$1 AND vendor_id=$2 RETURNING id", [uuidParam(req.params.id, "Override"), vendorOf(res).id]);
  if (!result.rowCount) throw notFound("Override");
  res.status(204).end();
}));
vendorRouter.post("/availability/blocked-periods", requireVendor, handle(async (req, res) => {
  const body = blockedPeriodSchema.parse(req.body); const id = vendorOf(res).id;
  const row = await transaction(async db => {
    // Same lock as hold creation, so time off and a booking can never interleave (SPEC 9.3).
    await lockVendorSchedule(db, id);
    await expireOverdueHolds(db, id);
    const overlap = await db.query("SELECT id FROM bookings WHERE vendor_id=$1 AND status IN ('HELD','PENDING','CONFIRMED') AND tstzrange(block_start,block_end,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1", [id, body.starts_at, body.ends_at]);
    if (overlap.rowCount) throw new AppError(409, "BOOKING_CONFLICT", "That period overlaps a booking. Cancel or move the booking first.");
    return (await db.query("INSERT INTO blocked_periods(id,vendor_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING id,starts_at,ends_at,reason", [randomUUID(), id, body.starts_at, body.ends_at, body.reason])).rows[0];
  });
  res.status(201).json(row);
}));
vendorRouter.delete("/availability/blocked-periods/:id", requireVendor, handle(async (req, res) => {
  const result = await pool.query("DELETE FROM blocked_periods WHERE id=$1 AND vendor_id=$2 RETURNING id", [uuidParam(req.params.id, "Blocked period"), vendorOf(res).id]);
  if (!result.rowCount) throw notFound("Blocked period");
  res.status(204).end();
}));

// ---- Offline payments (PY-10) -------------------------------------------------------------------------------
const offlinePaymentSchema = z.object({ kind: z.enum(["advance", "balance"]), amount_paise: z.number().int().positive().max(100_000_000), method: z.enum(["cash", "upi", "bank_transfer", "other"]), note: z.string().trim().min(3, "Add a short note, for example who paid and how.").max(500) }).strict();
/** The vendor records money received outside Bayana (cash, UPI to their own account). Audited, tagged offline in the ledger. */
vendorRouter.post("/bookings/:id/offline-payments", requireVendor, handle(async (req, res) => {
  const body = offlinePaymentSchema.parse(req.body);
  const result = await recordOfflinePayment({ vendorId: vendorOf(res).id, userId: userOf(res).id, bookingId: uuidParam(req.params.id, "Booking"), kind: body.kind, amountPaise: body.amount_paise, method: body.method, note: body.note });
  res.status(201).json(result);
  kickUrgent();
}));

// ---- Publishing ---------------------------------------------------------------------------------------------
vendorRouter.post("/publish", requireVendor, handle(async (_req, res) => {
  const missing = missingPublishRequirements(await checklistInput(pool, vendorOf(res).id));
  if (missing.length) throw new AppError(400, "PUBLISH_CHECKLIST_INCOMPLETE", "Complete onboarding before publishing", { missing });
  await pool.query("UPDATE vendors SET published=true,bookings_enabled=true WHERE id=$1", [vendorOf(res).id]);
  res.json({ published: true, missing: [] });
}));
vendorRouter.post("/unpublish", requireVendor, handle(async (_req, res) => {
  await pool.query("UPDATE vendors SET published=false,bookings_enabled=false WHERE id=$1", [vendorOf(res).id]);
  res.status(204).end();
}));
