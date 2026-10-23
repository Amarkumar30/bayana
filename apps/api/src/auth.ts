import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { config } from "./config.js";
import { sendEmail } from "./email.js";

const digest = (value: string) => createHash("sha256").update(`${config.SESSION_SECRET}:${value}`).digest("hex");
const otpDigest = (value: string) => createHmac("sha256", config.OTP_PEPPER).update(value).digest("hex");
export type SessionUser = { id: string; email: string; role: "PHOTOGRAPHER" | "CLIENT" | "ADMIN" };
export const sessionCookieName = "bayana_session";

export async function requestOtp(db: PoolClient, email: string, role: "PHOTOGRAPHER" | "CLIENT") {
  const cooldown = await db.query("SELECT 1 FROM auth_otps WHERE email=$1 AND role=$2 AND consumed_at IS NULL AND created_at > now() - interval '60 seconds' ORDER BY created_at DESC LIMIT 1", [email, role]);
  if (cooldown.rowCount) throw Object.assign(new Error("Please wait before requesting another code"), { status: 429, code: "OTP_RESEND_COOLDOWN" });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.query("UPDATE auth_otps SET consumed_at=now() WHERE email=$1 AND role=$2 AND consumed_at IS NULL", [email, role]);
  await db.query("INSERT INTO auth_otps(id,email,role,code_hash,expires_at) VALUES($1,$2,$3,$4,now() + interval '10 minutes')", [randomUUID(), email, role, otpDigest(code)]);
  await sendEmail({ from: config.EMAIL_FROM ?? "", to: email, subject: "Your Bayana verification code", text: `Your Bayana verification code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.` });
}

export async function verifyOtp(db: PoolClient, email: string, role: "PHOTOGRAPHER" | "CLIENT", code: string): Promise<{ user: SessionUser; token: string }> {
  const result = await db.query("SELECT * FROM auth_otps WHERE email=$1 AND role=$2 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [email, role]);
  if (!result.rowCount) throw Object.assign(new Error("Verification code has expired or is invalid"), { status: 401 });
  const otp = result.rows[0];
  if (otp.attempts >= 5) throw Object.assign(new Error("Too many verification attempts"), { status: 429 });
  const supplied = Buffer.from(otpDigest(code)); const expected = Buffer.from(otp.code_hash);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { await db.query("UPDATE auth_otps SET attempts=attempts+1 WHERE id=$1", [otp.id]); throw Object.assign(new Error("Verification code is invalid"), { status: 401 }); }
  await db.query("UPDATE auth_otps SET consumed_at=now() WHERE id=$1", [otp.id]);
  const userResult = await db.query("INSERT INTO users(id,email,role) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id,email,role", [randomUUID(), email, role]);
  const user = userResult.rows[0] as SessionUser;
  if (user.role !== role) throw Object.assign(new Error("This email belongs to another account type"), { status: 409 });
  const token = randomBytes(32).toString("base64url");
  await db.query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now() + interval '30 days')", [randomUUID(), user.id, digest(token)]);
  return { user, token };
}

export async function currentUser(db: Pool | PoolClient, token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  const result = await db.query("SELECT u.id,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()", [digest(token)]);
  return (result.rows[0] as SessionUser | undefined) ?? null;
}

export async function revokeSession(db: PoolClient, token?: string) { if (token) await db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [digest(token)]); }
