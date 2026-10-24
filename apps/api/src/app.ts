import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { currentUser, type SessionUser } from "./auth.js";
import { authRouter, cookieToken } from "./auth-routes.js";
import { bookingRouter, customerBookings } from "./booking-routes.js";
import { publicRouter } from "./public-routes.js";
import { vendorRouter } from "./vendor-routes.js";
import { captureFromWebhook, verifyWebhook } from "./payments.js";
import helmet from "helmet";
import { log, requestId } from "./logger.js";
import { errorBody, errorHandler, notFoundHandler } from "./errors.js";

export const app = express();
const userFor = (req: express.Request) => currentUser(pool, cookieToken(req));
const requireUser = async (req: express.Request, res: express.Response, role?: SessionUser["role"]) => { const user = await userFor(req); if (!user || (role && user.role !== role)) { res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required", details: {} } }); return null; } return user; };

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
app.use("/v1/bookings", bookingRouter);

app.get("/v1/client/bookings", async (req, res, next) => { try { const user = await requireUser(req, res, "CLIENT"); if (!user) return; res.json({ bookings: await customerBookings(user) }); } catch (errorValue) { next(errorValue); } });
app.use(notFoundHandler);
app.use(errorHandler);
