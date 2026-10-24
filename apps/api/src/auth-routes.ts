import { Router, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { pool, transaction } from "./database.js";
import { AppError, errorBody } from "./errors.js";
import { kickUrgent } from "./notifications/outbox.js";
import {
  checkOtp, consumeOtp, createOtp, currentUser, queueOtpEmail, event, findUserByEmail, hashPassword, invalidCredentials, invalidOtp, listSessions,
  normalizeEmail, revokeAllSessions, revokeSessionById, revokeSessionToken, sessionCookieName, startSession, validatePassword, verifyPassword, type PublicUser
} from "./auth.js";

const email = z.string().trim().max(254).email().transform(normalizeEmail);
const code = z.string().regex(/^\d{6}$/, "Enter the six-digit code");
const password = z.string().min(1).max(128);
const schemas = {
  otpRequest: z.object({ email, purpose: z.enum(["signup", "login", "reset"]) }).strict(),
  // AU-01: a verified email code creates the account; a password is optional (it can be added later in Settings).
  signup: z.object({ email, code, password: password.optional() }).strict(),
  login: z.union([z.object({ email, password }).strict(), z.object({ email, code }).strict()]),
  reset: z.object({ email, code, newPassword: password }).strict(),
  bookingOtpRequest: z.object({ email }).strict(),
  bookingOtpVerify: z.object({ email, code }).strict()
};

export const cookieToken = (req: Request) => req.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName}=`))?.slice(sessionCookieName.length + 1);
export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: config.NODE_ENV === "production", path: "/", ...(config.SESSION_COOKIE_DOMAIN ? { domain: config.SESSION_COOKIE_DOMAIN } : {}) });
const setSessionCookie = (res: Response, token: string) => res.cookie(sessionCookieName, token, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60_000 });
const clearSessionCookie = (res: Response) => res.clearCookie(sessionCookieName, cookieOptions());
export const meta = (req: Request) => ({ ip: req.ip, userAgent: req.header("user-agent") });
export const publicUser = (user: PublicUser): PublicUser => ({ id: user.id, email: user.email, role: user.role });

// Two limits per auth route: per client IP, and per IP+email so one address cannot be hammered from one client.
const limitHandler = (_req: Request, res: Response, _next: unknown, options: { windowMs: number }) =>
  res.status(429).set("Retry-After", String(Math.ceil(options.windowMs / 1000))).json(errorBody("RATE_LIMITED", "Too many attempts. Please wait a minute and try again."));
export const perIp = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false, handler: limitHandler });
const perIpAndEmail = (limit: number) => rateLimit({ windowMs: 60_000, limit, standardHeaders: "draft-8", legacyHeaders: false, handler: limitHandler,
  keyGenerator: req => `${ipKeyGenerator(req.ip ?? "")}|${typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : ""}` });
const guard = (ipLimit: number, emailLimit: number) => [perIp(ipLimit), perIpAndEmail(emailLimit)];

/** Starts a fresh session and revokes the one the request arrived with (token rotation). */
export async function rotateInto(req: Request, res: Response, db: Parameters<typeof startSession>[0], userId: string) {
  await revokeSessionToken(db, cookieToken(req));
  const token = await startSession(db, userId, meta(req));
  setSessionCookie(res, token);
}

export const authRouter = Router();

/** Uniform response for every email. Codes are only emailed where they can be used: signup for anyone, login/reset only for existing accounts. */
authRouter.post("/otp/request", ...guard(20, 5), async (req, res, next) => {
  try {
    const body = schemas.otpRequest.parse(req.body);
    await transaction(async db => {
      const code = await createOtp(db, body.email, body.purpose, req.ip);
      if (body.purpose === "signup" || await findUserByEmail(db, body.email)) await queueOtpEmail(db, body.email, code, body.purpose);
    });
    res.status(202).json({ ok: true });
    kickUrgent();
  } catch (error) { next(error); }
});

/**
 * The account exists once the email code is verified (AU-01); a password is optional. A repeat signup for an existing account
 * signs it in (the code proves the address); a password sent for an account that already has one must match it.
 */
authRouter.post("/signup", ...guard(20, 10), async (req, res, next) => {
  try {
    const body = schemas.signup.parse(req.body);
    if (body.password !== undefined) validatePassword(body.password, body.email);
    const otpId = await checkOtp(pool, body.email, "signup", body.code);
    const existing = await findUserByEmail(pool, body.email);
    const newHash = body.password !== undefined && !existing?.password_hash ? await hashPassword(body.password) : null;
    if (existing?.password_hash && body.password !== undefined && !(await verifyPassword(existing.password_hash, body.password))) throw invalidCredentials();
    const user = await transaction(async db => {
      await consumeOtp(db, otpId);
      let row: PublicUser;
      if (!existing) {
        row = (await db.query<PublicUser>("INSERT INTO users(id,email,role,email_verified_at,password_hash,password_set_at) VALUES(gen_random_uuid(),$1,'VENDOR',now(),$2,CASE WHEN $2::text IS NULL THEN NULL ELSE now() END) RETURNING id,email::text AS email,role", [body.email, newHash])).rows[0];
        await event(db, row.id, "signup", req.ip, req.header("user-agent"));
      } else if (!existing.password_hash && newHash) {
        // The code proves ownership of the email, so an account without a password (legacy vendor or booking customer) claims one here.
        row = (await db.query<PublicUser>("UPDATE users SET role=CASE WHEN role='CLIENT' THEN 'VENDOR' ELSE role END,password_hash=$2,password_set_at=now(),email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1 RETURNING id,email::text AS email,role", [existing.id, newHash])).rows[0];
        await revokeAllSessions(db, existing.id);
        await event(db, existing.id, "password_set", req.ip, req.header("user-agent"));
      } else {
        // A booking customer becoming a vendor without a password, or an existing vendor: the code signs them in.
        row = (await db.query<PublicUser>("UPDATE users SET role=CASE WHEN role='CLIENT' THEN 'VENDOR' ELSE role END,email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1 RETURNING id,email::text AS email,role", [existing.id])).rows[0];
        await event(db, existing.id, "login_via_signup", req.ip, req.header("user-agent"));
      }
      await rotateInto(req, res, db, row.id);
      return row;
    });
    res.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

/** Password OR email code. Unknown emails, missing passwords and wrong passwords are indistinguishable. */
authRouter.post("/login", ...guard(20, 10), async (req, res, next) => {
  try {
    const body = schemas.login.parse(req.body);
    if ("password" in body) {
      const user = await findUserByEmail(pool, body.email);
      if (!(await verifyPassword(user?.password_hash, body.password)) || !user) throw invalidCredentials();
      await transaction(async db => { await rotateInto(req, res, db, user.id); await event(db, user.id, "login_password", req.ip, req.header("user-agent")); });
      return res.json({ user: publicUser(user) });
    }
    const otpId = await checkOtp(pool, body.email, "login", body.code);
    const user = await transaction(async db => {
      await consumeOtp(db, otpId);
      const found = await findUserByEmail(db, body.email);
      if (!found) throw invalidOtp();
      await db.query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1", [found.id]);
      await rotateInto(req, res, db, found.id);
      await event(db, found.id, "login_otp", req.ip, req.header("user-agent"));
      return found;
    });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

/** Reset by code: sets the password, revokes every session, then signs this browser in with a fresh one. */
authRouter.post("/password/reset", ...guard(20, 10), async (req, res, next) => {
  try {
    const body = schemas.reset.parse(req.body);
    validatePassword(body.newPassword, body.email);
    const otpId = await checkOtp(pool, body.email, "reset", body.code);
    const newHash = await hashPassword(body.newPassword);
    const user = await transaction(async db => {
      await consumeOtp(db, otpId);
      const found = await findUserByEmail(db, body.email);
      if (!found) throw invalidOtp();
      await db.query("UPDATE users SET password_hash=$2,password_set_at=now(),email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1", [found.id, newHash]);
      await revokeAllSessions(db, found.id);
      const token = await startSession(db, found.id, meta(req));
      setSessionCookie(res, token);
      await event(db, found.id, "password_reset", req.ip, req.header("user-agent"));
      return found;
    });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

authRouter.post("/logout", perIp(60), async (req, res, next) => {
  try { await revokeSessionToken(pool, cookieToken(req)); clearSessionCookie(res); res.status(204).end(); } catch (error) { next(error); }
});

const requireSession = async (req: Request) => { const user = await currentUser(pool, cookieToken(req)); if (!user) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in is required"); return user; };
authRouter.get("/me", perIp(120), async (req, res, next) => { try { res.json({ user: publicUser(await requireSession(req)) }); } catch (error) { next(error); } });
authRouter.get("/sessions", perIp(60), async (req, res, next) => {
  try { const user = await requireSession(req); res.json({ sessions: (await listSessions(pool, user.id)).map(session => ({ ...session, current: session.id === user.sessionId })) }); } catch (error) { next(error); }
});
authRouter.delete("/sessions/:id", perIp(60), async (req, res, next) => {
  try {
    const user = await requireSession(req); const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success || !(await revokeSessionById(pool, user.id, id.data))) throw new AppError(404, "NOT_FOUND", "Session not found");
    if (id.data === user.sessionId) clearSessionCookie(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

/** Customer booking verification: unchanged behaviour (verified email gets a CLIENT account and session), now on otp_codes. */
authRouter.post("/booking/otp/request", ...guard(20, 5), async (req, res, next) => {
  try { const body = schemas.bookingOtpRequest.parse(req.body); await transaction(async db => queueOtpEmail(db, body.email, await createOtp(db, body.email, "booking_verify", req.ip), "booking_verify")); res.status(202).json({ ok: true }); kickUrgent(); } catch (error) { next(error); }
});
authRouter.post("/booking/otp/verify", ...guard(20, 10), async (req, res, next) => {
  try {
    const body = schemas.bookingOtpVerify.parse(req.body);
    const otpId = await checkOtp(pool, body.email, "booking_verify", body.code);
    const user = await transaction(async db => {
      await consumeOtp(db, otpId);
      const row = (await db.query<PublicUser>("INSERT INTO users(id,email,role,email_verified_at) VALUES(gen_random_uuid(),$1,'CLIENT',now()) ON CONFLICT(email) DO UPDATE SET email_verified_at=COALESCE(users.email_verified_at,now()) RETURNING id,email::text AS email,role", [body.email])).rows[0];
      await rotateInto(req, res, db, row.id);
      return row;
    });
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});
