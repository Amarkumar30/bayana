import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { currentUser, type SessionUser } from "./auth.js";
import { authRouter, cookieToken } from "./auth-routes.js";
import { createHold } from "./booking-service.js";
import { publicRouter } from "./public-routes.js";
import { vendorRouter } from "./vendor-routes.js";
import { createCheckoutOrder, captureFromWebhook, verifyWebhook } from "./payments.js";
import helmet from "helmet";
import { log, requestId } from "./logger.js";
import { errorBody, errorHandler, notFoundHandler } from "./errors.js";

export const app = express();
const userFor = (req: express.Request) => currentUser(pool, cookieToken(req));
const requireUser = async (req: express.Request, res: express.Response, role?: SessionUser["role"]) => { const user = await userFor(req); if (!user || (role && user.role !== role)) { res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required", details: {} } }); return null; } return user; };
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

app.disable("x-powered-by");
app.set("trust proxy", config.TRUST_PROXY);
app.use((req, res, next) => { res.locals.requestId = requestId(); res.setHeader("x-request-id", res.locals.requestId); next(); });
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGINS, credentials: true }));
app.post("/v1/payments/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res, next) => { try { const raw = req.body as Buffer; if (!verifyWebhook(raw, req.header("x-razorpay-signature"))) return res.status(400).json({ error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Invalid webhook signature", details: {} } }); const payload: unknown = JSON.parse(raw.toString("utf8")); const eventId = req.header("x-razorpay-event-id"); if (!eventId) return res.status(400).json({ error: { code: "MISSING_WEBHOOK_ID", message: "Missing webhook id", details: {} } }); await transaction(async db => { const inserted = await db.query("INSERT INTO webhook_events(provider_event_id,payload) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING provider_event_id", [eventId, payload]); if (inserted.rowCount) await captureFromWebhook(db, payload); }); res.status(204).end(); } catch (errorValue) { next(errorValue); } });
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", async (_req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true }); } catch (errorValue) { log("error", "ready.database_unreachable", { requestId: res.locals.requestId, err: errorValue instanceof Error ? errorValue.message : String(errorValue) }); res.status(503).json(errorBody("NOT_READY", "Database is not reachable")); } });

app.use("/v1/auth", authRouter);
app.use("/v1/vendors", publicRouter);
app.use("/v1/vendor", vendorRouter);

app.post("/v1/bookings", async (req, res, next) => { try { const user = await requireUser(req, res, "CLIENT"); if (!user) return; const body = z.object({ slug: z.string(), date: localDate, service_id: z.string().uuid(), starts_at: z.string().datetime(), name: z.string().trim().min(2).max(120), phone: z.string().trim().min(8).max(20).optional(), notes: z.string().max(2000).optional(), referral: z.string().trim().max(200).optional(), terms_accepted: z.literal(true) }).parse(req.body); const key = req.header("idempotency-key"); if (!key || !z.string().uuid().safeParse(key).success) throw Object.assign(new Error("A valid idempotency key is required"), { status: 400, code: "VALID_IDEMPOTENCY_KEY_REQUIRED" }); const booking = await transaction(async db => { const value = await createHold(db, { slug: body.slug, date: body.date, name: body.name, email: user.email, clientUserId: user.id, phone: body.phone, notes: body.notes, referral: body.referral, serviceId: body.service_id, startsAt: body.starts_at, termsAccepted: body.terms_accepted, key }); return { booking: value, checkout: value.status === "HELD" && value.payment_required && config.PAYMENT_MODE !== "disabled" ? await createCheckoutOrder(db, value) : null }; }); res.status(201).json(booking); } catch (errorValue) { next(errorValue); } });
app.get("/v1/bookings/:id", async (req, res) => { const id = z.string().uuid().safeParse(req.params.id); if (!id.success) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found", details: {} } }); const user = await userFor(req); const token = typeof req.query.t === "string" ? req.query.t : undefined; const hash = token ? createHash("sha256").update(`${config.SESSION_SECRET}:booking:${token}`).digest("hex") : null; const result = await pool.query("SELECT b.id,b.event_date,b.status,b.total_paise,b.advance_paise,b.hold_expires_at,b.starts_at,b.ends_at,b.service_name,v.slug,v.display_name,b.total_paise-COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind IN ('PAYMENT','REFUND')),0) AS balance_due_paise FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1 AND (b.client_user_id=$2 OR v.owner_user_id=$2 OR ($3::text IS NOT NULL AND b.access_token_hash=$3))", [id.data, user?.id ?? null, hash]); if (!result.rowCount) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found", details: {} } }); res.json(result.rows[0]); });
app.get("/v1/client/bookings", async (req, res) => { const user = await requireUser(req, res, "CLIENT"); if (!user) return; const result = await pool.query("SELECT b.id,b.event_date,b.status,b.total_paise,b.advance_paise,v.slug,v.display_name,b.total_paise-COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind IN ('PAYMENT','REFUND')),0) AS balance_due_paise FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.client_email=$1 ORDER BY b.created_at DESC", [user.email]); res.json({ bookings: result.rows }); });
app.use(notFoundHandler);
app.use(errorHandler);
