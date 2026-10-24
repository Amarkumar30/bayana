import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { advancePaise } from "@bayana/shared";
import { monthSummary, slotsForDate } from "./availability.js";
import { pool } from "./database.js";
import { AppError } from "./errors.js";
import { loadSlotEngineInput } from "./slot-data.js";

// One error for every way a public page can be unavailable (unknown slug, unpublished vendor, wrong or inactive service),
// so responses never reveal whether a vendor exists.
const unavailable = () => new AppError(404, "NOT_FOUND", "Not found");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = (perMinute: number) => rateLimit({ windowMs: 60_000, limit: perMinute, standardHeaders: "draft-8", legacyHeaders: false });
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/** Published vendor by current slug or a previous one (old links still work and redirect to the canonical slug). */
async function publishedVendorId(slug: string) {
  const vendor = await pool.query<{ id: string; slug: string }>("SELECT v.id,v.slug::text AS slug FROM vendors v LEFT JOIN vendor_slug_history h ON h.vendor_id=v.id AND h.slug=$1 WHERE (v.slug=$1 OR h.slug IS NOT NULL) AND v.published LIMIT 1", [slug]);
  if (!vendor.rowCount) throw unavailable();
  return vendor.rows[0];
}

export const publicRouter = Router();
publicRouter.get("/:slug", limit(120), handle(async (req, res) => {
  const { id } = await publishedVendorId(String(req.params.slug));
  const [vendor, services] = await Promise.all([
    pool.query("SELECT v.slug::text AS canonical_slug,v.slug::text AS slug,v.display_name,v.city,v.bio,v.service_area,v.timezone,v.terms,v.cancellation_policy,v.rescheduling_policy,v.phone_required,CASE WHEN v.public_contact_email THEN v.contact_email::text END AS contact_email,CASE WHEN v.public_contact_phone THEN v.contact_phone END AS contact_phone,COALESCE(array_agg(c.label ORDER BY c.label) FILTER (WHERE c.slug IS NOT NULL),'{}') AS categories FROM vendors v LEFT JOIN vendor_categories vc ON vc.vendor_id=v.id LEFT JOIN categories c ON c.slug=vc.category_slug WHERE v.id=$1 GROUP BY v.id", [id]),
    pool.query<{ price_paise: string; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number }>("SELECT id,name,description,price_paise,duration_minutes,booking_mode,advance_type,advance_value,customer_details_prompt,cancellation_tiers FROM services WHERE vendor_id=$1 AND active ORDER BY sort_order,created_at", [id])
  ]);
  res.json({ ...vendor.rows[0], services: services.rows.map(service => { const price = Number(service.price_paise); const advance = advancePaise(price, service.advance_type, service.advance_value); return { ...service, advance_paise: advance, remaining_paise: price - advance }; }) });
}));
publicRouter.get("/:slug/availability/month", limit(60), handle(async (req, res) => {
  const query = z.object({ service_id: z.string().uuid(), month }).parse(req.query);
  const engine = await loadSlotEngineInput(pool, (await publishedVendorId(String(req.params.slug))).id, query.service_id);
  if (!engine) throw unavailable();
  res.json({ timezone: engine.timezone, days: monthSummary(query.month, engine) });
}));
publicRouter.get("/:slug/availability/slots", limit(120), handle(async (req, res) => {
  const query = z.object({ service_id: z.string().uuid(), date: localDate }).parse(req.query);
  const engine = await loadSlotEngineInput(pool, (await publishedVendorId(String(req.params.slug))).id, query.service_id);
  if (!engine) throw unavailable();
  res.json({ timezone: engine.timezone, slots: slotsForDate(query.date, engine) });
}));
