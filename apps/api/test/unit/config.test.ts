import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const base = { DATABASE_URL: "postgres://user:password@localhost:5432/bayana_test", SESSION_SECRET: "a".repeat(32), EMAIL_TRANSPORT: "log", NODE_ENV: "development" };
describe("configuration", () => {
  it("defaults payments to disabled", () => expect(loadConfig(base).PAYMENT_MODE).toBe("disabled"));
  it("does not include configured values in validation errors", () => expect(() => loadConfig({ ...base, PAYMENT_MODE: "test", RAZORPAY_KEY_ID: "rzp_live_secret_value" })).toThrow("RAZORPAY_KEY_SECRET"));
  it("requires an OTP pepper in production", () => expect(() => loadConfig({ ...base, NODE_ENV: "production", EMAIL_TRANSPORT: "smtp", SMTP_URL: "smtp://localhost:2525", EMAIL_FROM: "mail@example.test" })).toThrow("OTP_PEPPER"));
});
