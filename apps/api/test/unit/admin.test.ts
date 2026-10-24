import { describe, expect, it } from "vitest";
import { diagnose } from "../../src/admin-routes.js";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hotp, matchTotp } from "../../src/totp.js";

describe("TOTP (RFC 6238, AU-10)", () => {
  const secret = Buffer.from("12345678901234567890");
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    for (const [seconds, code] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]] as const) expect(hotp(secret, Math.floor(seconds / 30), 8)).toBe(code);
  });
  it("accepts one step of drift either side and nothing further", () => {
    const now = 1_111_111_109_000, step = Math.floor(now / 30_000);
    expect(matchTotp(secret, hotp(secret, step), now)).toBe(step);
    expect(matchTotp(secret, hotp(secret, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, hotp(secret, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, hotp(secret, step + 2), now)).toBeNull();
    expect(matchTotp(secret, "12345", now)).toBeNull();
  });
  it("base32 round-trips and the stored form is encrypted and tamper-evident", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(base32Encode(secret));
    expect(decryptSecret(stored).equals(secret)).toBe(true);
    const parts = stored.split("."); parts[3] = `${parts[3].slice(0, -2)}AA`;
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("booking diagnosis (admin gate)", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const booking = (values: Record<string, unknown>) => ({ status: "PENDING", hold_expires_at: "2026-11-01T10:10:00Z", advance_paise: 20000, ends_at: "2026-11-05T10:00:00Z", ...values });
  const input = (values: Partial<Parameters<typeof diagnose>[0]>) => ({ booking: booking({}), payments: [], refunds: [], outbox: [], webhooks: [], hasContract: true, onlinePayments: true, ...values });
  it("a lapsed hold that was not expired yet offers the tick", () => {
    expect(diagnose(input({ booking: booking({ hold_expires_at: "2026-11-01T09:00:00Z" }) }), now)[0]).toMatchObject({ level: "warning", action: { kind: "run_tick" } });
  });
  it("names who the booking waits for", () => {
    expect(diagnose(input({}), now)[0].text).toContain("customer to pay");
    expect(diagnose(input({ onlinePayments: false }), now)[0].text).toContain("vendor to record");
  });
  it("an open order offers re-verification; a verified online payment on a pending booking is a problem", () => {
    expect(diagnose(input({ payments: [{ id: "p1", provider: "razorpay", status: "created", provider_order_id: "order_1", verified_at: null, amount_paise: 20000 }] }), now)[0]).toMatchObject({ action: { kind: "reverify_payment", id: "p1" } });
    expect(diagnose(input({ payments: [{ id: "p1", provider: "razorpay", status: "captured", provider_order_id: "order_1", verified_at: "2026-11-01T09:59:00Z", amount_paise: 20000 }] }), now)).toEqual([expect.objectContaining({ level: "problem", action: expect.objectContaining({ kind: "reverify_payment" }) })]);
  });
  it("confirmed without a verified payment, failed refunds, webhooks for review and failed emails are all reported", () => {
    const findings = diagnose(input({ booking: booking({ status: "CONFIRMED" }), refunds: [{ status: "failed", amount_paise: 20000, error: "boom" }], webhooks: [{ event_id: "evt_1", type: "payment.captured", needs_review: true, processed_at: null, error: "amount differs" }], outbox: [{ id: "m1", status: "failed", template: "otp", recipient: "a@b.c", attempts: 5, last_error: "SMTP down" }] }), now);
    expect(findings.map(item => item.level)).toEqual(["problem", "problem", "problem", "warning"]);
    expect(findings.map(item => item.action?.kind).filter(Boolean)).toEqual(["reprocess_webhook", "retry_email"]);
  });
  it("a healthy booking says so", () => {
    expect(diagnose(input({ booking: booking({ status: "CONFIRMED" }), payments: [{ id: "p1", provider: "razorpay", status: "captured", verified_at: "2026-11-01T09:59:00Z", amount_paise: 20000 }] }), now)).toEqual([{ level: "ok", text: "Nothing looks stuck. Status CONFIRMED." }]);
  });
});
