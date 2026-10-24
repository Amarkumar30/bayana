import { describe, expect, it } from "vitest";
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
  const value = { state: "s1", nonce: "n1", verifier: "v1", next: "/dashboard", linkUserId: null, expires: Date.now() + 60_000 };
  it("round-trips when untouched", () => expect(decodeGoogleCookie(encodeGoogleCookie(value))).toEqual(value));
  it("is refused when tampered, unsigned or expired", () => {
    const encoded = encodeGoogleCookie(value); const [payload, signature] = encoded.split(".");
    const forged = Buffer.from(JSON.stringify({ ...value, next: "/admin" })).toString("base64url");
    expect(decodeGoogleCookie(`${forged}.${signature}`)).toBeNull();
    expect(decodeGoogleCookie(payload)).toBeNull();
    expect(decodeGoogleCookie(encodeGoogleCookie({ ...value, expires: Date.now() - 1 }))).toBeNull();
    expect(decodeGoogleCookie(undefined)).toBeNull();
  });
  it("uses the S256 PKCE challenge from RFC 7636", () => expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"));
});
