import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { pool } from "./database.js";
import { currentUser, type SessionUser } from "./auth.js";
import { authRouter, cookieToken } from "./auth-routes.js";
import { bookingRouter, customerBookings } from "./booking-routes.js";
import { publicRouter } from "./public-routes.js";
import { vendorRouter } from "./vendor-routes.js";
import { processWebhookEvent, receiveWebhook } from "./payments/webhooks.js";
import helmet from "helmet";
import { runNightly, runTick, tickAuthorized } from "./jobs.js";
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
// Razorpay webhooks need the raw body for the signature, so this route is mounted before express.json (SPEC 11.3).
app.post("/webhooks/razorpay", express.raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
  try {
    const result = await receiveWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.header("x-razorpay-signature"), req.header("x-razorpay-event-id"));
    res.status(result.status).json(result.body);
    // Answer first (Razorpay waits 5 seconds at most), then apply the event.
    const eventId = result.process;
    if (eventId) setImmediate(() => { processWebhookEvent(eventId).catch(error => log("error", "webhook.processing_crashed", { eventId, err: error instanceof Error ? error.message : String(error) })); });
  } catch (errorValue) { next(errorValue); }
});
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", async (_req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true }); } catch (errorValue) { log("error", "ready.database_unreachable", { requestId: res.locals.requestId, err: errorValue instanceof Error ? errorValue.message : String(errorValue) }); res.status(503).json(errorBody("NOT_READY", "Database is not reachable")); } });

app.use("/v1/auth", authRouter);
app.use("/v1/vendors", publicRouter);
app.use("/v1/vendor", vendorRouter);
app.use("/v1/bookings", bookingRouter);

// Scheduled jobs (SPEC 15.3), called by GitHub Actions with Authorization: Bearer <TICK_SECRET>.
app.post("/internal/jobs/:kind", async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (kind !== "tick" && kind !== "nightly") return notFoundHandler(req, res);
    if (!config.TICK_SECRET) return res.status(503).json(errorBody("JOBS_NOT_CONFIGURED", "TICK_SECRET is not set"));
    if (!tickAuthorized(req.header("authorization"))) return res.status(401).json(errorBody("AUTHENTICATION_REQUIRED", "A valid job secret is required"));
    const result = kind === "tick" ? await runTick() : await runNightly();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (errorValue) { next(errorValue); }
});

app.get("/v1/client/bookings", async (req, res, next) => { try { const user = await requireUser(req, res, "CLIENT"); if (!user) return; res.json({ bookings: await customerBookings(user) }); } catch (errorValue) { next(errorValue); } });
app.use(notFoundHandler);
app.use(errorHandler);
