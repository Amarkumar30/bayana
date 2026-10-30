import { describe, expect, it } from "vitest";
import { bookingReturnPath, googleCustomerNextPath, googleIntent, parseBookingReturnPath } from "@bayana/shared";
import { loadConfig } from "../../src/config.js";
import { decodeGoogleCookie, encodeGoogleCookie, pkceChallenge, safeNextPath } from "../../src/google/provider.js";

const base = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000", DATABASE_URL: "postgres://user:password@localhost:5432/bayana_dev", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log" };

describe("Google sign-in configuration", () => {
  it("is off, not an error, without a client id", () => expect(loadConfig(base).GOOGLE_CLIENT_ID).toBeUndefined());
  it("needs the secret and the callback URL once a client id is set, and never echoes values", () => {
    let message = "";
    try { loadConfig({ ...base, GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com" }); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("GOOGLE_CLIENT_SECRET"); expect(message).toContain("GOOGLE_REDIRECT_URI"); expect(message).not.toContain("123-abc");
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "s".repeat(20), GOOGLE_REDIRECT_URI: "http://localhost:4000/v1/auth/google/callback" }).GOOGLE_REDIRECT_URI).toBe("http://localhost:4000/v1/auth/google/callback");
  });
  it("rejects a callback URL that is not the API's Google callback", () => expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: "1.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "s".repeat(20), GOOGLE_REDIRECT_URI: "http://localhost:3000/login" })).toThrow("GOOGLE_REDIRECT_URI"));
});

describe("return path allowlist (no open redirect)", () => {
  it("accepts app sections only", () => {
    for (const path of ["/dashboard", "/dashboard/bookings", "/dashboard/bookings/7f3c2a10-0001-4000-8000-000000000001", "/onboarding", "/admin/payments"]) expect(safeNextPath(path), path).toBe(path);
    for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/dashboard/../x", "/dashboard?next=//evil", "/login", "", "dashboard", "/dashboard#x", "/dashboard/%2e%2e", 42, null]) expect(safeNextPath(path), String(path)).toBeNull();
  });
});

describe("one-time Google cookie", () => {
  const value = { state: "s1", nonce: "n1", verifier: "v1", next: "/dashboard", linkUserId: null, intent: "vendor" as const, expires: Date.now() + 60_000 };
  it("round-trips when untouched", () => expect(decodeGoogleCookie(encodeGoogleCookie(value))).toEqual(value));
  it("is refused when tampered, unsigned or expired", () => {
    const encoded = encodeGoogleCookie(value); const [payload, signature] = encoded.split(".");
    const forged = Buffer.from(JSON.stringify({ ...value, next: "/admin" })).toString("base64url");
    expect(decodeGoogleCookie(`${forged}.${signature}`)).toBeNull();
    expect(decodeGoogleCookie(payload)).toBeNull();
    expect(decodeGoogleCookie(encodeGoogleCookie({ ...value, expires: Date.now() - 1 }))).toBeNull();
    expect(decodeGoogleCookie(undefined)).toBeNull();
  });
  it("carries the intent signed: a cookie from before intents is a vendor sign-in, an unknown or swapped intent is refused", () => {
    const { intent: _intent, ...older } = value;
    expect(decodeGoogleCookie(encodeGoogleCookie(older as unknown as typeof value))).toEqual(value);
    expect(decodeGoogleCookie(encodeGoogleCookie({ ...value, intent: "admin" } as unknown as typeof value))).toBeNull();
    const [payload, signature] = encodeGoogleCookie(value).split(".");
    const swapped = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), intent: "customer" })).toString("base64url");
    expect(decodeGoogleCookie(`${swapped}.${signature}`)).toBeNull();
  });
  it("uses the S256 PKCE challenge from RFC 7636", () => expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"));
});

describe("customer Google sign-in: intent and the booking return path", () => {
  const service = "11111111-1111-4111-8111-111111111111";
  it("intent defaults to vendor; only vendor and customer are accepted", () => {
    expect(googleIntent(undefined)).toBe("vendor"); expect(googleIntent("")).toBe("vendor");
    expect(googleIntent("vendor")).toBe("vendor"); expect(googleIntent("customer")).toBe("customer");
    for (const bad of ["admin", "VENDOR", "customer ", ["customer"], 1]) expect(googleIntent(bad)).toBeNull();
  });
  it("builds and re-reads the booking selection, in a fixed order", () => {
    const path = bookingReturnPath({ slug: "studio-sunday", service, date: "2026-11-12", start: "2026-11-12T08:30:00.000Z", blocks: 3 });
    expect(path).toBe(`/studio-sunday/book?service=${service}&date=2026-11-12&start=2026-11-12T08%3A30%3A00.000Z&blocks=3&google=1`);
    expect(parseBookingReturnPath(path)).toEqual({ slug: "studio-sunday", service, date: "2026-11-12", start: "2026-11-12T08:30:00.000Z", blocks: 3 });
    expect(googleCustomerNextPath(`/studio-sunday/book?google=1&days=2&date=2026-11-12&service=${service}`)).toBe(`/studio-sunday/book?service=${service}&date=2026-11-12&days=2&google=1`);
  });
  it.each([
    ["another host", `https://evil.example/studio-sunday/book?service=${service}`],
    ["a protocol-relative URL", `//evil.example/studio-sunday/book?service=${service}`],
    ["a backslash", `/\evil.example/book?service=${service}`],
    ["a dot segment", `/studio-sunday/../dashboard/book?service=${service}`],
    ["a non-booking page", "/dashboard"],
    ["an app section dressed as a slug", `/dashboard/settings/book?service=${service}`],
    ["an unknown parameter", `/studio-sunday/book?service=${service}&next=//evil.example`],
    ["a repeated parameter", `/studio-sunday/book?service=${service}&service=${service}`],
    ["a hash", `/studio-sunday/book?service=${service}#x`],
    ["no service", "/studio-sunday/book?date=2026-11-12"],
    ["a bad service id", "/studio-sunday/book?service=not-a-uuid"],
    ["a bad date", `/studio-sunday/book?service=${service}&date=12-11-2026`],
    ["a bad start", `/studio-sunday/book?service=${service}&start=javascript:alert(1)`],
    ["too many sessions", `/studio-sunday/book?service=${service}&blocks=13`],
    ["too many days", `/studio-sunday/book?service=${service}&days=31`],
    ["an upper-case slug", `/Studio/book?service=${service}`]
  ])("refuses %s", (_case, value) => expect(googleCustomerNextPath(value)).toBeNull());
});
