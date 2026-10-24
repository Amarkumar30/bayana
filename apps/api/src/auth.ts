import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { Pool, PoolClient } from "pg";
import { config } from "./config.js";
import { sendEmail } from "./email.js";

const sessionHash = (token: string) => createHash("sha256").update(`${config.SESSION_SECRET}:${token}`).digest("hex");
const otpHash = (code: string) => createHmac("sha256", config.OTP_PEPPER).update(code).digest("hex");
const ticketHash = (ticket: string) => createHash("sha256").update(`${config.SESSION_SECRET}:ticket:${ticket}`).digest("hex");
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$k5HyjR2qTT1ntD+SaGo4ICUCU9vZQzC8ZwXzxcCVpKw";
const commonPasswords = new Set(["passwordpassword", "1234567890", "qwertyuiop", "letmeinletmein", "welcome123", "password123"]);
export type Purpose = "signup" | "login" | "reset" | "booking_verify";
export type SessionUser = { id: string; email: string; role: "VENDOR" | "CLIENT" | "ADMIN"; password_hash: string | null; fresh_until: Date | null };
export const sessionCookieName = "bayana_session";

const fail = (message: string, status = 401, code = "INVALID_CREDENTIALS") => Object.assign(new Error(message), { status, code });
const codeEmail = (code: string, purpose: Purpose) => ({ subject: "Your Bayana verification code", text: `Your Bayana verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`, html: `<p>Your Bayana verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`, purpose });
async function email(to: string, message: { subject: string; text: string; html?: string }) { await sendEmail({ from: config.EMAIL_FROM ?? "", to, ...message }); }
export function validatePassword(password: string, email: string) { if (password.length < 10 || password.length > 128) throw fail("Password must be 10 to 128 characters", 400, "INVALID_PASSWORD"); if (commonPasswords.has(password.toLowerCase()) || password.toLowerCase() === email.toLowerCase()) throw fail("Choose a less common password", 400, "INVALID_PASSWORD"); }
export async function hashPassword(password: string) { return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }); }
export async function issueOtp(db: PoolClient, emailAddress: string, purpose: Purpose, ip?: string) {
  const emailValue = emailAddress.toLowerCase();
  const recent = await db.query("SELECT 1 FROM otp_challenges WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL AND created_at > now()-interval '60 seconds'", [emailValue, purpose]);
  const hourly = await db.query("SELECT count(*)::int AS count FROM otp_challenges WHERE email=$1 AND created_at > now()-interval '1 hour'", [emailValue]);
  const ipHourly = ip ? await db.query("SELECT count(*)::int AS count FROM otp_challenges WHERE request_ip=$1::inet AND created_at > now()-interval '1 hour'", [ip]) : { rows: [{ count: 0 }] };
  if (recent.rowCount || hourly.rows[0].count >= 10 || ipHourly.rows[0].count >= 30) throw fail("Please wait before requesting another code", 429, "OTP_RATE_LIMITED");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.query("UPDATE otp_challenges SET consumed_at=now() WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL", [emailValue, purpose]);
  await db.query("INSERT INTO otp_challenges(id,email,purpose,code_hash,expires_at,request_ip) VALUES($1,$2,$3,$4,now()+interval '10 minutes',$5::inet)", [randomUUID(), emailValue, purpose, otpHash(code), ip ?? null]);
  const message = codeEmail(code, purpose); await email(emailValue, message); return code;
}
export async function consumeOtp(db: PoolClient, emailAddress: string, purpose: Purpose, code: string) {
  const result = await db.query<{ id: string; code_hash: string }>("SELECT id,code_hash FROM otp_challenges WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [emailAddress.toLowerCase(), purpose]);
  if (!result.rowCount) throw fail("Verification code is invalid or expired", 401, "INVALID_OTP");
  const challenge = result.rows[0]; const supplied = Buffer.from(otpHash(code)); const expected = Buffer.from(challenge.code_hash);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { const increment = await db.query("UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1 AND consumed_at IS NULL AND attempts<5 RETURNING attempts", [challenge.id]); if (!increment.rowCount || increment.rows[0].attempts >= 5) await db.query("UPDATE otp_challenges SET consumed_at=now() WHERE id=$1", [challenge.id]); throw fail("Verification code is invalid or expired", 401, "INVALID_OTP"); }
  const consumed = await db.query("UPDATE otp_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND attempts<5 RETURNING id", [challenge.id]);
  if (!consumed.rowCount) throw fail("Verification code is invalid or expired", 401, "INVALID_OTP");
}
export async function createTicket(db: PoolClient, emailValue: string, purpose: "signup" | "reset") { const token = randomBytes(32).toString("base64url"); await db.query("INSERT INTO auth_tickets(id,token_hash,email,purpose,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')", [randomUUID(), ticketHash(token), emailValue, purpose]); return token; }
export async function consumeTicket(db: PoolClient, token: string, purpose: "signup" | "reset") { const result = await db.query<{ email: string }>("UPDATE auth_tickets SET consumed_at=now() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING email", [ticketHash(token), purpose]); if (!result.rowCount) throw fail("Ticket is invalid or expired", 401, "INVALID_TICKET"); return result.rows[0].email; }
export async function startSession(db: PoolClient, userId: string) { const token = randomBytes(32).toString("base64url"); await db.query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,last_used_at,fresh_until) VALUES($1,$2,$3,now()+interval '30 days',now(),now()+interval '15 minutes')", [randomUUID(), userId, sessionHash(token)]); return token; }
export async function currentUser(db: Pool | PoolClient, token?: string): Promise<SessionUser | null> { if (!token) return null; const result = await db.query<SessionUser>("UPDATE auth_sessions s SET last_used_at=now() FROM users u WHERE s.user_id=u.id AND s.token_hash=$1 AND s.expires_at>now() AND s.last_used_at>now()-interval '7 days' RETURNING u.id,u.email,u.role,u.password_hash,s.fresh_until", [sessionHash(token)]); return result.rows[0] ?? null; }
export async function revokeSession(db: PoolClient, token?: string) { if (token) await db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [sessionHash(token)]); }
export async function revokeOtherSessions(db: PoolClient, userId: string, token?: string) { if (token) await db.query("DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2", [userId, sessionHash(token)]); else await db.query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]); }
export async function passwordLogin(db: PoolClient, emailValue: string, password: string) { const found = await db.query<{ id: string; password_hash: string | null; email: string; role: SessionUser["role"] }>("SELECT id,password_hash,email,role FROM users WHERE email=$1", [emailValue.toLowerCase()]); const user = found.rows[0]; const valid = await argon2.verify(user?.password_hash ?? dummyHash, password).catch(() => false); if (!user || !user.password_hash || !valid) throw fail("Invalid email or password"); const token = await startSession(db, user.id); return { user: { id: user.id, email: user.email, role: user.role }, token }; }
export async function event(db: PoolClient, userId: string | null, type: string, ip?: string, userAgent?: string) { await db.query("INSERT INTO auth_events(id,user_id,type,ip,user_agent) VALUES($1,$2,$3,$4::inet,$5)", [randomUUID(), userId, type, ip ?? null, userAgent ?? null]); }
