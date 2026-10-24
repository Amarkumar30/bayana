import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const base = { NODE_ENV: "development", WEB_ORIGINS: "http://localhost:3000", DATABASE_URL: "postgres://user:password@localhost:5432/bayana_dev", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log" };
const production = { ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://mail.example.test:587", EMAIL_FROM: "Bayana <hello@example.test>", OTP_PEPPER: "p".repeat(32), DATABASE_URL_DIRECT: "postgres://user:password@db.example.test:5432/bayana" };

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
  it("requires an OTP pepper and a direct database URL in production", () => {
    expect(() => loadConfig({ ...production, OTP_PEPPER: "" })).toThrow("OTP_PEPPER");
    expect(() => loadConfig({ ...production, DATABASE_URL_DIRECT: "" })).toThrow("DATABASE_URL_DIRECT");
    expect(loadConfig(production).DATABASE_URL_DIRECT).toBe(production.DATABASE_URL_DIRECT);
  });
  it("uses DATABASE_URL for migrations when no direct URL is set outside production", () => expect(loadConfig(base).DATABASE_URL_DIRECT).toBe(base.DATABASE_URL));
  it("refuses live payments without production and LIVE_PAYMENTS_ACK", () => {
    const live = { RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w".repeat(16), PAYMENT_MODE: "live" };
    expect(() => loadConfig({ ...base, ...live })).toThrow("LIVE_PAYMENTS_ACK");
    expect(() => loadConfig({ ...production, ...live })).toThrow("LIVE_PAYMENTS_ACK");
  });
  it("aborts on a key and mode mismatch", () => expect(() => loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w".repeat(16) })).toThrow("test key"));
  it("uses DATABASE_URL_TEST in test mode and requires a _test name", () => {
    const test = { ...base, NODE_ENV: "test", EMAIL_TRANSPORT: "smtp" };
    expect(() => loadConfig(test)).toThrow("DATABASE_URL_TEST");
    expect(() => loadConfig({ ...test, DATABASE_URL_TEST: "postgres://u:p@localhost:5432/bayana_dev" })).toThrow("ending in _test");
    expect(loadConfig({ ...test, DATABASE_URL_TEST: "postgres://u:p@localhost:5432/bayana_test" }).DATABASE_URL).toMatch(/bayana_test$/);
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
