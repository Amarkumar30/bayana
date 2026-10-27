import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { loadConfig } from "../../src/config.js";
import { cookieDomainCovers, looksLikePlaceholder } from "../../src/config-schema.js";

const base = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000", DATABASE_URL: "postgres://user:password@localhost:5432/bayana_dev", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log" };
const production = { ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://mail.example.test:587", EMAIL_FROM: "Bayana <hello@example.test>", OTP_PEPPER: "p".repeat(32), DATABASE_URL_DIRECT: "postgres://user:password@db.example.test:5432/bayana", TICK_SECRET: "t".repeat(32) };

describe("configuration", () => {
  it("defaults payments to disabled", () => expect(loadConfig(base).PAYMENT_MODE).toBe("disabled"));
  it("parses WEB_ORIGINS as an exact-origin allowlist", () => expect(loadConfig({ ...base, WEB_ORIGINS: "https://bayana.in, https://www.bayana.in" }).WEB_ORIGINS).toEqual(["https://bayana.in", "https://www.bayana.in"]));
  it("rejects origins with a path or trailing slash", () => expect(() => loadConfig({ ...base, WEB_ORIGINS: "https://bayana.in/" })).toThrow("WEB_ORIGINS"));
  it("accepts the legacy WEB_ORIGIN name outside production only", () => {
    const { WEB_ORIGINS: _unused, ...legacy } = base;
    expect(loadConfig({ ...legacy, WEB_ORIGIN: "http://localhost:3000" }).WEB_ORIGINS).toEqual(["http://localhost:3000"]);
    const { WEB_ORIGINS: _alsoUnused, ...legacyProduction } = production;
    expect(() => loadConfig({ ...legacyProduction, WEB_ORIGIN: "https://bayana.in" })).toThrow("WEB_ORIGINS: is missing");
  });
  it("names variables but never echoes their values", () => {
    const secretish = "rzp_live_do_not_print_this";
    let message = "";
    try { loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: secretish, DATABASE_URL: "not a url" }); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(secretish);
    expect(message).not.toContain("not a url");
  });
  it("requires an OTP pepper, a direct database URL and a job secret in production", () => {
    expect(() => loadConfig({ ...production, OTP_PEPPER: "" })).toThrow("OTP_PEPPER");
    expect(() => loadConfig({ ...production, TICK_SECRET: "" })).toThrow("TICK_SECRET: is required in production");
    expect(() => loadConfig({ ...production, TICK_SECRET: "short" })).toThrow("TICK_SECRET");
    expect(() => loadConfig({ ...production, DATABASE_URL_DIRECT: "" })).toThrow("DATABASE_URL_DIRECT");
    expect(loadConfig(production).DATABASE_URL_DIRECT).toBe(production.DATABASE_URL_DIRECT);
  });
  it("uses DATABASE_URL for migrations when no direct URL is set outside production", () => expect(loadConfig(base).DATABASE_URL_DIRECT).toBe(base.DATABASE_URL));
  it("refuses live payments without production and LIVE_PAYMENTS_ACK", () => {
    const live = { RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w".repeat(16), PAYMENT_MODE: "live" };
    expect(() => loadConfig({ ...base, ...live })).toThrow("LIVE_PAYMENTS_ACK");
    expect(() => loadConfig({ ...production, ...live })).toThrow("LIVE_PAYMENTS_ACK");
  });
  it("aborts on a key and mode mismatch (PY-01)", () => {
    expect(() => loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w".repeat(16) })).toThrow("is a live key");
    // A live key is refused even while payments are disabled, so a copied production file can never sit in a dev .env unnoticed.
    expect(() => loadConfig({ ...base, PAYMENT_MODE: "disabled", RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s" })).toThrow("is a live key");
    expect(() => loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "key_without_prefix", RAZORPAY_KEY_SECRET: "s" })).toThrow("must start with rzp_test_ or rzp_live_");
    expect(() => loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "rzp_test_x" })).toThrow("RAZORPAY_KEY_SECRET: is required when PAYMENT_MODE=test");
  });
  it("lets test keys stay in the file while payments are disabled, and allows test mode before the webhook secret exists", () => {
    expect(loadConfig({ ...base, PAYMENT_MODE: "disabled", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" }).PAYMENT_MODE).toBe("disabled");
    expect(loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" }).PAYMENT_MODE).toBe("test");
  });
  it("allows the fake payment provider only under test", () => expect(() => loadConfig({ ...base, PAYMENT_PROVIDER: "fake" })).toThrow("fake only when NODE_ENV=test"));
  it("uses DATABASE_URL_TEST in test mode and requires a _test name", () => {
    const test = { ...base, NODE_ENV: "test", EMAIL_TRANSPORT: "capture" };
    expect(() => loadConfig(test)).toThrow("DATABASE_URL_TEST");
    expect(() => loadConfig({ ...test, DATABASE_URL_TEST: "postgres://u:p@localhost:5432/bayana_dev" })).toThrow("ending in _test");
    expect(loadConfig({ ...test, DATABASE_URL_TEST: "postgres://u:p@localhost:5432/bayana_test" }).DATABASE_URL).toMatch(/bayana_test$/);
  });
  it("keeps email in memory under test unless SMTP is chosen explicitly, and never captures outside test", () => {
    const test = { ...base, NODE_ENV: "test", EMAIL_TRANSPORT: undefined, DATABASE_URL_TEST: "postgres://u:p@localhost:5432/bayana_test" };
    expect(loadConfig(test).EMAIL_TRANSPORT).toBe("capture");
    expect(() => loadConfig({ ...test, EMAIL_TRANSPORT: "smtp" })).toThrow("SMTP_URL");
    expect(loadConfig({ ...test, EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://localhost:1025", EMAIL_FROM: "Bayana <t@example.test>" }).EMAIL_TRANSPORT).toBe("smtp");
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: "capture" })).toThrow("capture only when NODE_ENV=test");
  });
  it("refuses a _test database as the runtime database outside test mode", () => expect(() => loadConfig({ ...base, DATABASE_URL: "postgres://u:p@localhost:5432/bayana_test" })).toThrow("must not name a _test database"));
  it("exits the process with a clear message when the environment is invalid", () => {
    const tsx = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
    const configModule = fileURLToPath(new URL("../../src/config.ts", import.meta.url));
    const result = spawnSync(process.execPath, [tsx, configModule], { cwd: fileURLToPath(new URL("../../test/", import.meta.url)), env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "development", SESSION_SECRET: "short-value-123" }, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid environment. Edit apps/api/.env");
    expect(result.stderr).toContain("SESSION_SECRET");
    expect(result.stderr).not.toContain("short-value-123");
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});

// APP_ENV=production is the public site on bayana.in (docs/DOMAIN_SWITCH.md). Values here are fakes, never real secrets.
const random = () => randomBytes(32).toString("hex");
const site = {
  NODE_ENV: "production", APP_ENV: "production", TRUST_PROXY: "1", WEB_ORIGINS: "https://bayana.in", SESSION_COOKIE_DOMAIN: ".bayana.in",
  DATABASE_URL: "postgres://app:pw@ep-fake-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require", DATABASE_URL_DIRECT: "postgres://app:pw@ep-fake.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  SESSION_SECRET: random(), OTP_PEPPER: random(), TICK_SECRET: random(), EMAIL_TRANSPORT: "brevo_api", BREVO_API_KEY: "k".repeat(40), EMAIL_FROM: "Bayana <bookings@bayana.in>",
  GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "fake-google-client-value", GOOGLE_REDIRECT_URI: "https://api.bayana.in/v1/auth/google/callback"
};
const refusal = (overrides: Record<string, string | undefined>) => { try { loadConfig({ ...site, ...overrides }); return ""; } catch (error) { return (error as Error).message; } };

describe("APP_ENV=production startup guard", () => {
  it("accepts the bayana.in settings, and staging and local settings are unchanged", () => {
    expect(loadConfig(site).WEB_ORIGINS).toEqual(["https://bayana.in"]);
    const staging = { ...site, APP_ENV: "staging", WEB_ORIGINS: "https://staging.bayana.in", SESSION_COOKIE_DOMAIN: ".staging.bayana.in", SESSION_COOKIE_NAME: "bayana_staging_session", GOOGLE_REDIRECT_URI: "https://api.staging.bayana.in/v1/auth/google/callback" };
    expect(loadConfig(staging).SESSION_COOKIE_NAME).toBe("bayana_staging_session");
    // Staging is not held to the production rules (for example a copied secret or no cookie domain still loads).
    expect(() => loadConfig({ ...staging, SESSION_COOKIE_DOMAIN: undefined, TICK_SECRET: "t".repeat(32) })).not.toThrow();
    expect(loadConfig(base).APP_ENV).toBe("local");
    expect(loadConfig(site).SESSION_COOKIE_NAME).toBe("bayana_session");
  });
  it.each([
    ["NODE_ENV is not production", { NODE_ENV: "development", EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://mail.example.test:587" }, "NODE_ENV: must be production when APP_ENV=production"],
    ["an origin is http", { WEB_ORIGINS: "http://bayana.in" }, "WEB_ORIGINS: must list only https origins"],
    ["an origin is localhost", { WEB_ORIGINS: "https://bayana.in,https://localhost:3000" }, "WEB_ORIGINS: must list only https origins"],
    ["the Google redirect URI is localhost", { GOOGLE_REDIRECT_URI: "http://localhost:4000/v1/auth/google/callback" }, "GOOGLE_REDIRECT_URI: must be an https URL"],
    ["the database is a _dev one", { DATABASE_URL: "postgres://bayana:pw@db.example.test:5432/bayana_dev" }, "DATABASE_URL: must not name a _dev or _test database"],
    ["the direct database is a _test one", { DATABASE_URL_DIRECT: "postgres://bayana:pw@db.example.test:5432/bayana_test" }, "DATABASE_URL_DIRECT: must not name a _dev or _test database"],
    ["the cookie domain is missing", { SESSION_COOKIE_DOMAIN: undefined }, "SESSION_COOKIE_DOMAIN: is required when APP_ENV=production"],
    ["the cookie domain is staging's", { SESSION_COOKIE_DOMAIN: ".staging.bayana.in" }, "SESSION_COOKIE_DOMAIN: must cover the web host"],
    ["the cookie domain does not cover the API host", { GOOGLE_REDIRECT_URI: "https://api.bayana.example/v1/auth/google/callback" }, "SESSION_COOKIE_DOMAIN: must also cover the API host"],
    ["the session secret is a placeholder", { SESSION_SECRET: "change-me-to-a-long-random-value-please" }, "SESSION_SECRET: looks like a placeholder"],
    ["the OTP pepper is missing", { OTP_PEPPER: undefined }, "OTP_PEPPER: is required"],
    ["the tick secret is a repeated character", { TICK_SECRET: "t".repeat(40) }, "TICK_SECRET: looks like a placeholder"],
    ["payments are live", { PAYMENT_MODE: "live", LIVE_PAYMENTS_ACK: "yes", RAZORPAY_KEY_ID: "rzp_live_fake0000", RAZORPAY_KEY_SECRET: "fake-live-secret", RAZORPAY_WEBHOOK_SECRET: "w".repeat(20) }, "PAYMENT_MODE: may not be live in this build"]
  ])("refuses to start when %s", (_case, overrides, message) => {
    const text = refusal(overrides);
    expect(text).toContain(message);
    for (const value of Object.values(overrides)) if (value && value.length > 8) expect(text).not.toContain(value);
  });
  it("matches cookie domains to hosts and spots copied placeholders", () => {
    expect(cookieDomainCovers(".bayana.in", "bayana.in")).toBe(true); expect(cookieDomainCovers(".bayana.in", "api.bayana.in")).toBe(true);
    expect(cookieDomainCovers("bayana.in", "www.bayana.in")).toBe(true);
    expect(cookieDomainCovers(".staging.bayana.in", "bayana.in")).toBe(false); expect(cookieDomainCovers(".in", "bayana.in")).toBe(false);
    expect(cookieDomainCovers(".bayana.in", "notbayana.in")).toBe(false);
    for (const value of ["change-me", "<generate>", "your-secret-here", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "abababababababababababab", "placeholder-value"]) expect(looksLikePlaceholder(value)).toBe(true);
    for (let index = 0; index < 20; index++) expect(looksLikePlaceholder(random())).toBe(false);
  });
});
