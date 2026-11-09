import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { bookingPageUrl } from "@bayana/shared";
import { config } from "./config.js";

// Private "View your booking" links. A token is 32 random bytes; only its keyed SHA-256 is stored (the first in
// bookings.access_token_hash, every later one in booking_access_tokens). Any of them opens that one booking, read-only.

type Db = Pool | PoolClient;
export const tokenHash = (token: string) => createHash("sha256").update(`${config.SESSION_SECRET}:booking:${token}`).digest("hex");
export const bookingUrl = (bookingId: string, token?: string) => bookingPageUrl(config.SITE_URL, bookingId, token);

/** SQL: does the token hash in `param` open the booking aliased `alias` (its first link, or a later one not revoked)? */
export const tokenMatches = (alias: string, param: string) =>
  `(${alias}.access_token_hash=${param} OR EXISTS(SELECT 1 FROM booking_access_tokens t WHERE t.booking_id=${alias}.id AND t.token_hash=${param} AND t.revoked_at IS NULL))`;

/**
 * A new private link for one customer email, inside the caller's transaction. `send` queues the email with the link and
 * returns the outbox id, or null when that email was already queued (dedupe); then the unused token is removed again.
 */
export async function withCustomerLink(db: Db, bookingId: string, purpose: string, send: (link: string) => Promise<string | null>) {
  const token = randomBytes(32).toString("base64url"), id = randomUUID();
  await db.query("INSERT INTO booking_access_tokens(id,booking_id,token_hash,purpose) VALUES($1,$2,$3,$4)", [id, bookingId, tokenHash(token), purpose]);
  const queued = await send(bookingUrl(bookingId, token));
  if (!queued) await db.query("DELETE FROM booking_access_tokens WHERE id=$1", [id]);
  return queued;
}

/** Turns off every private link to these bookings (a customer erased their data). */
export async function revokeBookingLinks(db: Db, bookingIds: string[]) {
  if (!bookingIds.length) return;
  await db.query("UPDATE bookings SET access_token_hash=NULL WHERE id = ANY($1)", [bookingIds]);
  await db.query("UPDATE booking_access_tokens SET revoked_at=now() WHERE booking_id = ANY($1) AND revoked_at IS NULL", [bookingIds]);
}
