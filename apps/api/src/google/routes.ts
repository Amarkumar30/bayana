import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { googleCustomerNextPath, googleIntent } from "@bayana/shared";
import { currentUser, event, findUserByEmail, hashPassword, invalidCredentials, validatePassword, verifyPassword, type PublicUser, type SessionUser } from "../auth.js";
import { cookieOptions, cookieToken, meta, perIp, readCookie, rotateInto } from "../auth-routes.js";
import { config } from "../config.js";
import { recordConsent } from "../consent.js";
import { pool, transaction } from "../database.js";
import { AppError } from "../errors.js";
import { log } from "../logger.js";
import { decodeGoogleCookie, encodeGoogleCookie, GOOGLE_COOKIE, GOOGLE_COOKIE_MINUTES, googleProvider, GoogleSignInError, pkceChallenge, randomToken, safeNextPath, stateHash, verifyIdToken } from "./provider.js";

// Google sign-in routes (SPEC 4.1 AU-02, 12.1) and the signed-in user's sign-in methods (Settings > Sign-in methods).

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const web = (path: string) => `${config.WEB_ORIGINS[0]}${path}`;
/** The one-time cookie is sent only to the callback path, never to the rest of the API. */
const googleCookieOptions = () => ({ ...cookieOptions(), path: "/v1/auth/google", maxAge: GOOGLE_COOKIE_MINUTES * 60_000 });
const disabled = () => new AppError(404, "GOOGLE_DISABLED", "Google sign-in is not available");
const requireSession = async (req: Request) => { const user = await currentUser(pool, cookieToken(req)); if (!user) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in is required"); return user; };

export const googleRouter = Router();

/** Whether the web should show "Continue with Google". */
googleRouter.get("/providers", perIp(120), (_req, res) => { res.json({ google: googleProvider() !== null }); });

/**
 * Starts sign-in (or, with mode=link and a session, connecting Google to the signed-in account). The state, nonce, PKCE
 * verifier and intent go into a signed, httpOnly, 10-minute cookie; the state's hash is stored so the callback can be used
 * only once. intent=vendor (default) returns to an app section; intent=customer returns only to a booking page
 * (/<slug>/book?..., re-validated) and can never connect Google to an account.
 */
googleRouter.get("/google/start", perIp(30), handle(async (req, res) => {
  const provider = googleProvider();
  if (!provider) throw disabled();
  const intent = googleIntent(req.query.intent);
  if (!intent) throw new AppError(400, "INVALID_INTENT", "Choose vendor or customer sign-in");
  const link = req.query.mode === "link";
  if (link && intent === "customer") throw new AppError(400, "INVALID_INTENT", "Connecting Google is for business accounts");
  const next = intent === "customer" ? googleCustomerNextPath(req.query.next)
    : req.query.next === undefined ? (link ? "/dashboard/settings" : "/dashboard") : safeNextPath(req.query.next);
  if (!next) throw new AppError(400, "INVALID_NEXT", "That return address is not allowed");
  const linkUserId = link ? (await requireSession(req)).id : null;
  const state = randomToken(), nonce = randomToken(), verifier = randomToken();
  await pool.query("INSERT INTO oauth_login_states(state_hash) VALUES($1)", [stateHash(state)]);
  res.cookie(GOOGLE_COOKIE, encodeGoogleCookie({ state, nonce, verifier, next, linkUserId, intent, expires: Date.now() + GOOGLE_COOKIE_MINUTES * 60_000 }), googleCookieOptions());
  log("info", "google.start", { requestId: res.locals.requestId, link, intent });
  res.redirect(302, provider.authorizationUrl({ state, nonce, codeChallenge: pkceChallenge(verifier) }));
}));

type Outcome = { user: PublicUser; path: string; kind: "signin" | "linked" | "created" | "connected" };
/**
 * Each failure becomes a short code the page turns into a sentence; nothing about the token, code or email is logged. A
 * customer goes back to the booking they started (?google_error=), everyone else to /login or Settings (?error=).
 */
const fail = (res: Response, code: string, reason: string, path = "/login") => {
  log("warn", "google.callback_failed", { requestId: res.locals.requestId, code, reason });
  // Customers return to their booking page (its google=1 marker dropped), with the code as google_error.
  const url = new URL(path, "https://return.invalid"), customer = url.pathname.endsWith("/book");
  if (customer) url.searchParams.delete("google");
  url.searchParams.set(customer ? "google_error" : "error", code);
  res.redirect(302, web(`${url.pathname}${url.search}`));
};

googleRouter.get("/google/callback", perIp(30), handle(async (req, res) => {
  const provider = googleProvider();
  // Whatever happens next, the one-time cookie is used up.
  const cookie = decodeGoogleCookie(readCookie(req.headers.cookie, GOOGLE_COOKIE));
  res.clearCookie(GOOGLE_COOKIE, { ...cookieOptions(), path: "/v1/auth/google" });
  const back = cookie?.linkUserId ? "/dashboard/settings" : cookie?.intent === "customer" ? cookie.next : "/login";
  if (!provider) return fail(res, "google_unavailable", "disabled", back);
  if (req.query.error === "access_denied") return fail(res, "google_cancelled", "access_denied", back);
  if (typeof req.query.error === "string") return fail(res, "google_failed", "provider error", back);
  const state = typeof req.query.state === "string" ? req.query.state : "", code = typeof req.query.code === "string" ? req.query.code : "";
  if (!cookie) return fail(res, "google_expired", "missing or invalid cookie", back);
  if (!state || state !== cookie.state || !code) return fail(res, "google_failed", "state mismatch", back);
  // Single use, server side: a replayed callback (even with a copied cookie) finds the state already claimed.
  const claimed = await pool.query("UPDATE oauth_login_states SET used_at=now() WHERE state_hash=$1 AND used_at IS NULL AND created_at > now() - make_interval(mins => $2) RETURNING state_hash", [stateHash(state), GOOGLE_COOKIE_MINUTES]);
  if (!claimed.rowCount) return fail(res, "google_expired", "state already used or expired", back);

  let identity;
  try { identity = await verifyIdToken(provider, (await provider.exchangeCode({ code, codeVerifier: cookie.verifier })).idToken, cookie.nonce); }
  catch (error) {
    if (error instanceof GoogleSignInError) return fail(res, error.reason === "email_unverified" ? "google_unverified" : "google_failed", error.reason, back);
    throw error;
  }

  let outcome: Outcome;
  try { outcome = await transaction(db => applyGoogle(db, req, res, identity, cookie)); }
  catch (error) {
    if (error instanceof AppError && error.code.startsWith("google_")) return fail(res, error.code, error.message, back);
    throw error;
  }
  log("info", "google.signed_in", { requestId: res.locals.requestId, userId: outcome.user.id, kind: outcome.kind, intent: cookie.intent });
  res.redirect(302, web(outcome.path));
}));

/**
 * The account rules, in one transaction (SPEC 12.1): an existing Google identity signs its user in; else a user with the same
 * verified email is linked; else a new vendor account is created and sent to onboarding. One user per email, always.
 */
async function applyGoogle(db: Parameters<typeof rotateInto>[2], req: Request, res: Response, identity: { sub: string; email: string }, cookie: NonNullable<ReturnType<typeof decodeGoogleCookie>>): Promise<Outcome> {
  const linked = await db.query<{ user_id: string }>("SELECT user_id FROM auth_identities WHERE provider='google' AND provider_subject=$1", [identity.sub]);
  const insertIdentity = async (userId: string) => {
    await db.query("SAVEPOINT link_identity");
    try { await db.query("INSERT INTO auth_identities(id,user_id,provider,provider_subject,email_at_link) VALUES($1,$2,'google',$3,$4)", [randomUUID(), userId, identity.sub, identity.email]); await db.query("RELEASE SAVEPOINT link_identity"); }
    catch (error) {
      await db.query("ROLLBACK TO SAVEPOINT link_identity");
      // unique (user_id, provider): this account already has a different Google account connected.
      if ((error as { code?: string }).code === "23505") throw new AppError(409, "google_other_account", "a different Google account is already connected");
      throw error;
    }
  };
  const userRow = async (id: string) => (await db.query<PublicUser & { deleted_at: Date | null }>("SELECT id,email::text AS email,role,deleted_at FROM users WHERE id=$1", [id])).rows[0];

  if (cookie.linkUserId) {
    // Connecting from Settings: only to the account that started it, and only if this Google account is not someone else's.
    const session = await currentUser(db, cookieToken(req));
    if (!session || session.id !== cookie.linkUserId) throw new AppError(401, "google_session_changed", "the session that started connecting is gone");
    if (linked.rowCount && linked.rows[0].user_id !== session.id) throw new AppError(409, "google_in_use", "this Google account belongs to another Bayana account");
    if (!linked.rowCount) await insertIdentity(session.id);
    await event(db, session.id, "google_connected", req.ip, req.header("user-agent"));
    return { user: session, path: "/dashboard/settings?google=connected", kind: "connected" };
  }

  if (cookie.intent === "customer") return applyCustomer(db, req, res, identity, cookie, linked.rows[0]?.user_id ?? null, insertIdentity, userRow);

  let user: PublicUser, kind: Outcome["kind"];
  if (linked.rowCount) {
    const found = await userRow(linked.rows[0].user_id);
    if (!found || found.deleted_at) throw new AppError(403, "google_failed", "account closed");
    user = found; kind = "signin";
    // A customer who first used Google for a booking and now signs in as a business (the vendor button) becomes a vendor,
    // as through the email-code signup; this is the only way a customer account becomes a vendor account.
    if (found.role === "CLIENT") { user = (await db.query<PublicUser>("UPDATE users SET role='VENDOR' WHERE id=$1 RETURNING id,email::text AS email,role", [found.id])).rows[0]; kind = "linked"; }
  } else {
    const existing = await findUserByEmail(db, identity.email);
    if (existing) {
      await insertIdentity(existing.id);
      // Google verified this address, so the account's email is verified too; a booking customer becomes a vendor, as with signup.
      user = (await db.query<PublicUser>("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()),role=CASE WHEN role='CLIENT' THEN 'VENDOR' ELSE role END WHERE id=$1 RETURNING id,email::text AS email,role", [existing.id])).rows[0];
      kind = "linked";
    } else {
      user = (await db.query<PublicUser>("INSERT INTO users(id,email,role,email_verified_at) VALUES($1,$2,'VENDOR',now()) RETURNING id,email::text AS email,role", [randomUUID(), identity.email])).rows[0];
      await insertIdentity(user.id);
      await event(db, user.id, "signup_google", req.ip, req.header("user-agent"));
      kind = "created";
    }
  }
  // Joining through Google (new account, or an existing address now becoming a Google account) agrees to the terms (PV-01).
  if (kind !== "signin") await recordConsent(db, { userId: user.id, kinds: ["account_terms", "vendor_terms", "privacy_policy"], source: "signup_google", ip: req.ip, userAgent: req.header("user-agent") });
  await rotateInto(req, res, db, user.id);
  await event(db, user.id, kind === "linked" ? "google_linked" : "login_google", req.ip, req.header("user-agent"));
  const hasProfile = (await db.query("SELECT 1 FROM vendors WHERE owner_user_id=$1", [user.id])).rowCount;
  // A vendor without a business profile sets one up first (as after email signup); /admin is never redirected.
  return { user, path: !hasProfile && user.role === "VENDOR" && !cookie.next.startsWith("/admin") ? "/onboarding" : cookie.next, kind };
}

/**
 * A customer confirming their email for a booking (intent=customer). The proof is the one the email-code path produces
 * (POST /v1/auth/booking/otp/verify): a session for the one users row of this Google-verified email, which is created as a
 * CLIENT if new. An existing account keeps its role: nobody becomes a vendor here, no password is set, no vendor terms
 * are recorded (the booking's own terms are agreed to on the booking), and the person goes straight back to the booking.
 */
async function applyCustomer(db: Parameters<typeof rotateInto>[2], req: Request, res: Response, identity: { sub: string; email: string }, cookie: NonNullable<ReturnType<typeof decodeGoogleCookie>>,
  linkedUserId: string | null, insertIdentity: (userId: string) => Promise<void>, userRow: (id: string) => Promise<(PublicUser & { deleted_at: Date | null }) | undefined>): Promise<Outcome> {
  let user: PublicUser, kind: Outcome["kind"];
  if (linkedUserId) {
    const found = await userRow(linkedUserId);
    if (!found || found.deleted_at) throw new AppError(403, "google_failed", "account closed");
    user = found; kind = "signin";
  } else {
    const existing = await findUserByEmail(db, identity.email);
    if (existing) {
      await insertIdentity(existing.id);
      user = (await db.query<PublicUser>("UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1 RETURNING id,email::text AS email,role", [existing.id])).rows[0];
      kind = "linked";
    } else {
      user = (await db.query<PublicUser>("INSERT INTO users(id,email,role,email_verified_at) VALUES($1,$2,'CLIENT',now()) RETURNING id,email::text AS email,role", [randomUUID(), identity.email])).rows[0];
      await insertIdentity(user.id);
      await event(db, user.id, "signup_google_customer", req.ip, req.header("user-agent"));
      kind = "created";
    }
  }
  // Same person, same row: a business account signs in as itself (its role never changes). Holds are for customer accounts
  // (POST /v1/bookings), as on the email-code path; the booking page tells a business account to use another email.
  await rotateInto(req, res, db, user.id);
  await event(db, user.id, kind === "linked" ? "google_linked" : "login_google", req.ip, req.header("user-agent"));
  return { user, path: cookie.next, kind };
}

// ---- Sign-in methods (Settings) ----------------------------------------------------------------------------------------
type Methods = { emailCode: boolean; password: boolean; google: { connected: boolean; email: string | null } };
async function methodsOf(db: Pool | PoolClient, userId: string): Promise<Methods> {
  const row = (await db.query<{ verified: boolean; has_password: boolean; google_email: string | null }>(
    "SELECT u.email_verified_at IS NOT NULL AND u.deleted_at IS NULL AS verified,u.password_hash IS NOT NULL AS has_password,(SELECT email_at_link::text FROM auth_identities WHERE user_id=u.id AND provider='google') AS google_email FROM users u WHERE u.id=$1", [userId])).rows[0];
  // An email code works for any address that has been verified once (signup, booking or Google).
  return { emailCode: row.verified, password: row.has_password, google: { connected: row.google_email !== null, email: row.google_email } };
}
const methodCount = (methods: Methods) => Number(methods.emailCode) + Number(methods.password) + Number(methods.google.connected);
const lastMethod = () => new AppError(409, "LAST_SIGN_IN_METHOD", "Keep at least one way to sign in. Add another method before removing this one.");

googleRouter.get("/methods", perIp(60), handle(async (req, res) => {
  const user = await requireSession(req);
  const methods = await methodsOf(pool, user.id);
  res.json({ email_code: methods.emailCode, password: { set: methods.password }, google: { available: googleProvider() !== null, ...methods.google } });
}));

googleRouter.delete("/google", perIp(30), handle(async (req, res) => {
  const user = await requireSession(req);
  await transaction(async db => {
    await db.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const methods = await methodsOf(db, user.id);
    if (!methods.google.connected) throw new AppError(404, "NOT_FOUND", "Google is not connected");
    if (methodCount(methods) <= 1) throw lastMethod();
    await db.query("DELETE FROM auth_identities WHERE user_id=$1 AND provider='google'", [user.id]);
    await event(db, user.id, "google_disconnected", req.ip, req.header("user-agent"));
  });
  res.status(204).end();
}));

/** Set, change or remove the password. Changing it needs the current one; any change signs out every other device. */
const revokeOthers = (db: PoolClient, user: SessionUser) => db.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL", [user.id, user.sessionId]);
googleRouter.put("/password", perIp(20), handle(async (req, res) => {
  const user = await requireSession(req);
  const body = z.object({ current_password: z.string().max(128).optional(), new_password: z.string().min(1).max(128) }).strict().parse(req.body);
  validatePassword(body.new_password, user.email);
  const stored = (await findUserByEmail(pool, user.email))?.password_hash ?? null;
  if (stored && !(await verifyPassword(stored, body.current_password ?? ""))) throw invalidCredentials();
  const hash = await hashPassword(body.new_password);
  await transaction(async db => {
    await db.query("UPDATE users SET password_hash=$2,password_set_at=now() WHERE id=$1", [user.id, hash]);
    await revokeOthers(db, user);
    await event(db, user.id, stored ? "password_changed" : "password_set", req.ip, req.header("user-agent"));
  });
  res.json({ password: { set: true } });
}));
googleRouter.delete("/password", perIp(20), handle(async (req, res) => {
  const user = await requireSession(req);
  const body = z.object({ current_password: z.string().min(1).max(128) }).strict().parse(req.body);
  const stored = (await findUserByEmail(pool, user.email))?.password_hash ?? null;
  if (!(await verifyPassword(stored, body.current_password))) throw invalidCredentials();
  await transaction(async db => {
    await db.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    if (methodCount(await methodsOf(db, user.id)) <= 1) throw lastMethod();
    await db.query("UPDATE users SET password_hash=NULL,password_set_at=NULL WHERE id=$1", [user.id]);
    await revokeOthers(db, user);
    await event(db, user.id, "password_removed", req.ip, req.header("user-agent"));
  });
  res.json({ password: { set: false } });
}));
