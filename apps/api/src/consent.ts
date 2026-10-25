import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { POLICY_VERSIONS } from "@bayana/shared";

type Kind = keyof typeof POLICY_VERSIONS;
type Source = "signup_email" | "signup_google" | "booking_accept";

/** PV-01: one append-only row per policy agreed, with the policy version in force, the time, IP and user agent. */
export async function recordConsent(db: PoolClient, input: { userId?: string | null; bookingId?: string | null; kinds: Kind[]; source: Source; ip?: string; userAgent?: string }) {
  for (const kind of input.kinds) {
    await db.query("INSERT INTO consents(id,user_id,booking_id,kind,policy_version,source,ip,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7::inet,$8)",
      [randomUUID(), input.userId ?? null, input.bookingId ?? null, kind, POLICY_VERSIONS[kind], input.source, input.ip || null, input.userAgent?.slice(0, 512) ?? null]);
  }
}
