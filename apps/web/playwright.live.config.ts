import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end against the real API on the *_test database, with OTP emails read from Mailpit (pnpm.cmd db:up).
// Run: pnpm.cmd test:e2e (both payment modes, see e2e-live/run.mjs). It refuses to start unless DATABASE_URL_TEST names a database ending in _test.
const testDatabase = process.env.DATABASE_URL_TEST ?? "";
if (!/_test$/.test(new URL(testDatabase || "postgres://x/none").pathname)) throw new Error("The live suite needs DATABASE_URL_TEST naming a database that ends in _test (it never touches dev data).");

const webPort = Number(process.env.E2E_WEB_PORT ?? 3200), apiPort = Number(process.env.E2E_API_PORT ?? 4100);
export const liveUrls = { web: `http://127.0.0.1:${webPort}`, api: `http://127.0.0.1:${apiPort}`, mailpit: process.env.MAILPIT_URL ?? "http://127.0.0.1:8025" };
process.env.E2E_API_URL = liveUrls.api; process.env.E2E_MAILPIT_URL = liveUrls.mailpit;
// "fake" runs the API in test mode against FakeProvider with throwaway values (never real keys); see e2e-live/run.mjs.
export const fakePayments = { keyId: "rzp_test_e2eFakeKeyId", keySecret: "e2e_fake_key_secret_not_real", webhookSecret: "e2e_fake_webhook_secret_not_real" };
const payments = process.env.E2E_PAYMENTS === "fake"
  ? { PAYMENT_MODE: "test", PAYMENT_PROVIDER: "fake", RAZORPAY_KEY_ID: fakePayments.keyId, RAZORPAY_KEY_SECRET: fakePayments.keySecret, RAZORPAY_WEBHOOK_SECRET: fakePayments.webhookSecret }
  : { PAYMENT_MODE: "disabled", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "" };

export default defineConfig({
  testDir: "./e2e-live",
  globalSetup: "./e2e-live/global-setup.ts",
  outputDir: path.join(os.tmpdir(), "bayana-playwright-live"),
  // One worker: the race test drives two browsers itself; parallel files would only add noise to `next dev`.
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  // One client address per run (see freshIp in e2e-live/helpers.ts); tests that open extra browsers give each its own.
  use: { baseURL: liveUrls.web, timezoneId: "Asia/Kolkata", locale: "en-IN", trace: "retain-on-failure", extraHTTPHeaders: { "x-forwarded-for": `10.200.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` } },
  projects: [{ name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }],
  webServer: [
    {
      // Creates and migrates the _test database (forward-only), then serves the API in test mode with real SMTP to Mailpit.
      command: "pnpm --filter @bayana/shared build && pnpm --filter @bayana/api migrate:test && pnpm --filter @bayana/api exec tsx src/server.ts",
      url: `${liveUrls.api}/health`, timeout: 180_000, reuseExistingServer: false,
      env: { NODE_ENV: "test", DATABASE_URL_TEST: testDatabase, PORT: String(apiPort), WEB_ORIGINS: liveUrls.web, SESSION_SECRET: randomBytes(32).toString("hex"), ...payments, EMAIL_TRANSPORT: "smtp", SMTP_URL: process.env.E2E_SMTP_URL ?? "smtp://127.0.0.1:1025", EMAIL_FROM: "Bayana E2E <e2e@bayana.local>", TRUST_PROXY: "1" }
    },
    {
      command: `pnpm exec next dev --port ${webPort}`,
      url: `${liveUrls.web}/waking`, timeout: 180_000, reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: liveUrls.api, NEXT_PUBLIC_SITE_URL: liveUrls.web, NEXT_PUBLIC_RAZORPAY_KEY_ID: "", NEXT_TELEMETRY_DISABLED: "1" }
    }
  ]
});
