import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { Pool, PoolClient } from "pg";
import { config } from "./config.js";
import { enqueue, PRIORITY } from "./notifications/outbox.js";
import { AppError } from "./errors.js";
import { log } from "./logger.js";

export type Purpose = "signup" | "login" | "reset" | "booking_verify";
export type Role = "VENDOR" | "CLIENT" | "ADMIN";
export type PublicUser = { id: string; email: string; role: Role };
export type SessionUser = PublicUser & { sessionId: string };
export const sessionCookieName = "bayana_session";

export const OTP_TTL_MINUTES = 10, OTP_MAX_ATTEMPTS = 5, OTP_RESEND_SECONDS = 60, OTP_EMAIL_HOURLY_CAP = 10, OTP_IP_HOURLY_CAP = 30;
const SESSION_SLIDING_DAYS = 30, SESSION_ABSOLUTE_DAYS = 90;
// A real argon2id hash of a random throwaway value: verifying against it costs the same as a real check.
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$k5HyjR2qTT1ntD+SaGo4ICUCU9vZQzC8ZwXzxcCVpKw";
const commonPasswords = new Set(["passwordpassword", "1234567890", "qwertyuiop", "letmeinletmein", "welcome123", "password123", "iloveyou123", "qwerty12345"]);

// One message per failure class, never revealing which part was wrong or whether the account exists.
export const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
export const invalidOtp = () => new AppError(400, "OTP_INVALID", "That code is wrong or has expired. Request a new one.");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const sessionHash = (token: string) => createHash("sha256").update(`${config.SESSION_SECRET}:${token}`).digest("hex");
export const otpHmac = (email: string, purpose: Purpose, code: string) => createHmac("sha256", config.OTP_PEPPER).update(`${normalizeEmail(email)}|${purpose}|${code}`).digest("hex");

export function validatePassword(password: string, email: string) {
  if (password.length < 10 || password.length > 128) throw new AppError(400, "INVALID_PASSWORD", "Use 10 to 128 characters for your password.");
  if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase() === normalizeEmail(email)) throw new AppError(400, "INVALID_PASSWORD", "That password is too easy to guess. Choose a less common one.");
}
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
/** Always runs one argon2 verification, against a dummy hash when there is no real one, so timing does not reveal accounts. */
export async function verifyPassword(hash: string | null | undefined, password: string) {
  const ok = await argon2.verify(hash ?? dummyHash, password).catch(() => false);
  return Boolean(hash) && ok;
}

/**
 * Creates an OTP row for any email (known or not) so the work done is identical; the caller decides whether to send it.
 * Enforces the 60 s resend cooldown per email+purpose (unconsumed codes only) and hourly caps per email and per IP.
 */
export async function createOtp(db: Pool | PoolClient, emailAddress: string, purpose: Purpose, ip?: string) {
  const email = normalizeEmail(emailAddress);
  const limits = await db.query<{ recent: boolean; email_count: number; ip_count: number }>(
    `SELECT EXISTS(SELECT 1 FROM otp_codes WHERE email_normalized=$1 AND purpose=$2 AND consumed_at IS NULL AND last_sent_at > now() - make_interval(secs => $4)) AS recent,
            (SELECT count(*)::int FROM otp_codes WHERE email_normalized=$1 AND created_at > now() - interval '1 hour') AS email_count,
            (SELECT count(*)::int FROM otp_codes WHERE $3::inet IS NOT NULL AND request_ip=$3::inet AND created_at > now() - interval '1 hour') AS ip_count`,
    [email, purpose, ip ?? null, OTP_RESEND_SECONDS]);
  const { recent, email_count, ip_count } = limits.rows[0];
  if (recent || email_count >= OTP_EMAIL_HOURLY_CAP || ip_count >= OTP_IP_HOURLY_CAP) throw new AppError(429, "OTP_RATE_LIMITED", "Please wait a minute before asking for another code.", { retryAfterSeconds: OTP_RESEND_SECONDS });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // A new code supersedes any older unconsumed code for the same purpose.
  await db.query("UPDATE otp_codes SET consumed_at=now() WHERE email_normalized=$1 AND purpose=$2 AND consumed_at IS NULL", [email, purpose]);
  await db.query("INSERT INTO otp_codes(id,email_normalized,purpose,code_hmac,expires_at,request_ip) VALUES($1,$2,$3,$4,now()+make_interval(mins => $5),$6::inet)", [randomUUID(), email, purpose, otpHmac(email, purpose, code), OTP_TTL_MINUTES, ip ?? null]);
  return code;
}

/**
 * Queues the code email (priority 0) in the caller's transaction. The route sends it right after the HTTP response
 * (kickUrgent), so SMTP latency never differs between known and unknown emails, and an SMTP outage only delays it.
 */
export async function queueOtpEmail(db: PoolClient, to: string, code: string, purpose: Purpose) {
  const action = purpose === "signup" ? "finish creating your account" : purpose === "reset" ? "reset your password" : purpose === "booking_verify" ? "confirm your booking email" : "sign in";
  await enqueue(db, "otp", to, { code, action, minutes: OTP_TTL_MINUTES }, { priority: PRIORITY.urgent });
}

/**
 * Step 1 of verification, committed on its own: atomically counts this attempt against the newest live code.
 * Counting outside the caller's transaction means a failed request cannot roll the attempt back.
 * Returns the code id when the code matches; the caller consumes it inside its own transaction.
 */
export async function checkOtp(pool: Pool, emailAddress: string, purpose: Purpose, code: string): Promise<string> {
  const email = normalizeEmail(emailAddress);
  const attempt = await pool.query<{ id: string; code_hmac: string }>(
    `UPDATE otp_codes SET attempts = attempts + 1
     WHERE id = (SELECT id FROM otp_codes WHERE email_normalized=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1)
       AND attempts < $3
     RETURNING id, code_hmac`, [email, purpose, OTP_MAX_ATTEMPTS]);
  const row = attempt.rows[0];
  const supplied = Buffer.from(otpHmac(email, purpose, code));
  // Compare against a same-length placeholder when there is no row so the work is the same.
  const expected = Buffer.from(row?.code_hmac ?? "0".repeat(supplied.length));
  const match = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!row || !match) throw invalidOtp();
  return row.id;
}
/** Step 2: single use. Runs inside the business transaction so the code is only spent if the action succeeds. */
export async function consumeOtp(db: PoolClient, otpId: string) {
  const consumed = await db.query("UPDATE otp_codes SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at > now() RETURNING id", [otpId]);
  if (!consumed.rowCount) throw invalidOtp();
}

export async function findUserByEmail(db: Pool | PoolClient, emailAddress: string) {
  const result = await db.query<PublicUser & { password_hash: string | null }>("SELECT id,email::text AS email,role,password_hash FROM users WHERE email_normalized=$1", [normalizeEmail(emailAddress)]);
  return result.rows[0] ?? null;
}

export async function startSession(db: PoolClient, userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  await db.query(`INSERT INTO sessions(id,user_id,token_hash,expires_at,absolute_expires_at,ip,user_agent) VALUES($1,$2,$3,now()+make_interval(days => $4),now()+make_interval(days => $5),$6::inet,$7)`,
    [randomUUID(), userId, sessionHash(token), SESSION_SLIDING_DAYS, SESSION_ABSOLUTE_DAYS, meta.ip ?? null, meta.userAgent?.slice(0, 512) ?? null]);
  return token;
}
/** Resolves a cookie token to its user and slides the expiry forward, never past the absolute cap. */
export async function currentUser(db: Pool | PoolClient, token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  const result = await db.query<SessionUser>(
    `UPDATE sessions s SET last_used_at=now(), expires_at=LEAST(now()+make_interval(days => $2), s.absolute_expires_at)
     FROM users u WHERE s.user_id=u.id AND s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND s.absolute_expires_at > now()
     RETURNING u.id, u.email::text AS email, u.role, s.id AS "sessionId"`, [sessionHash(token), SESSION_SLIDING_DAYS]);
  return result.rows[0] ?? null;
}
export async function revokeSessionToken(db: Pool | PoolClient, token?: string) { if (token) await db.query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [sessionHash(token)]); }
export async function revokeAllSessions(db: Pool | PoolClient, userId: string) { await db.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]); }
export async function listSessions(db: Pool | PoolClient, userId: string) {
  return (await db.query<{ id: string; created_at: Date; last_used_at: Date; ip: string | null; user_agent: string | null }>(
    "SELECT id,created_at,last_used_at,host(ip) AS ip,user_agent FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() AND absolute_expires_at > now() ORDER BY last_used_at DESC", [userId])).rows;
}
export async function revokeSessionById(db: Pool | PoolClient, userId: string, sessionId: string) {
  return (await db.query("UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", [sessionId, userId])).rowCount === 1;
}

export async function event(db: Pool | PoolClient, userId: string | null, type: string, ip?: string, userAgent?: string) { await db.query("INSERT INTO auth_events(id,user_id,type,ip,user_agent) VALUES($1,$2,$3,$4::inet,$5)", [randomUUID(), userId, type, ip ?? null, userAgent?.slice(0, 512) ?? null]); }
