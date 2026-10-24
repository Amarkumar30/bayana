import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { MOCK_API_URL } from "./e2e/mock-api";

// Visual and layout checks run against `next dev` with every API call mocked in the browser.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const siteUrl = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Keep run artefacts out of the app folder so `next dev` never sees files appear mid-run.
  outputDir: path.join(os.tmpdir(), "bayana-playwright-results"),
  globalSetup: "./e2e/global-setup.ts",
  // One worker: parallel navigations make `next dev` compile and hot-swap CSS concurrently, which made screenshots flaky.
  workers: 1,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: { baseURL: siteUrl, colorScheme: "light", contextOptions: { reducedMotion: "reduce" }, timezoneId: "Asia/Kolkata", locale: "en-IN" },
  projects: [
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `${siteUrl}/design`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_URL: MOCK_API_URL, NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_TELEMETRY_DISABLED: "1" }
  }
});
