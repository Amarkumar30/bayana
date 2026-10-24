import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

// Admin second factor (AU-10): RFC 6238 TOTP (SHA-1, 30 s, 6 digits), the format every authenticator app reads.
// The shared secret is stored encrypted (AES-256-GCM) with a key derived from SESSION_SECRET, which is already permanent:
// booking links and sessions depend on it too.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text: string) {
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(secret: Buffer, counter: number, digits = 6) {
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

/**
 * The time step a code matches, allowing one step of clock drift either side, or null. The caller stores the step and
 * refuses any step at or before the last one used, so a code cannot be replayed.
 */
export function matchTotp(secret: Buffer, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const supplied = Buffer.from(code);
  for (const step of [totpStep(now) - 1, totpStep(now), totpStep(now) + 1]) if (timingSafeEqual(Buffer.from(hotp(secret, step)), supplied)) return step;
  return null;
}

export const newTotpSecret = () => randomBytes(20);
export const otpauthUrl = (secret: Buffer, account: string) => `otpauth://totp/${encodeURIComponent(`Bayana admin:${account}`)}?secret=${base32Encode(secret)}&issuer=Bayana&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;

const key = () => Buffer.from(hkdfSync("sha256", config.SESSION_SECRET, "bayana-totp", "admin-totp-v1", 32));
export function encryptSecret(secret: Buffer) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}
export function decryptSecret(stored: string) {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown TOTP secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
}
