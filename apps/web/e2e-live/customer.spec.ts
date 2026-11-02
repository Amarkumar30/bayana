import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseTimeAndDetails, codeFor, freshIp, publishedVendor } from "./helpers";

// A customer who booked closes the browser and comes back later: still signed in, their booking on /my-bookings. Real
// browser, real API (*_test), real email (Mailpit). The session is the same whether the email was confirmed by code or by
// Google (the API's Google path is covered with FakeGoogleProvider in apps/api/test/integration/google.test.ts).
test.skip(process.env.E2E_PAYMENTS === "fake", "runs in the payments-disabled pass");

async function bookAndComeBack(page: Page, browser: Browser) {
  const vendor = await publishedVendor("Come Back Studio");
  const email = `e2e-return-${randomUUID().slice(0, 8)}@example.test`;
  await page.goto(`/${vendor.slug}/book?service=${vendor.serviceId}`);
  await chooseTimeAndDetails(page, { name: "Asha Rao", email });
  const asked = Date.now() - 1000;
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(email, asked));
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(page.getByRole("link", { name: "View your booking" }).first()).toBeVisible();

  // What the browser keeps on disk. A cookie without Max-Age/Expires is a session cookie (expires -1) and is gone after a restart.
  const state = await page.context().storageState();
  const session = state.cookies.find(cookie => cookie.name === "bayana_session");
  expect(session, "session cookie").toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe("Lax");
  expect(session!.expires * 1000).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  await page.context().close();

  // "Later": a new browser context from only what was stored.
  const later = await browser.newContext({ storageState: state, extraHTTPHeaders: { "x-forwarded-for": freshIp() }, viewport: page.viewportSize() ?? undefined });
  const again = await later.newPage();
  await again.goto("/my-bookings");
  await expect(again.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await expect(again.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(again.getByRole("link", { name: vendor.displayName })).toBeVisible();
  await expect(again.getByRole("heading", { name: "Sign in to see your bookings" })).toHaveCount(0);
  await later.close();
}

test("on a phone: book, close the browser, come back to My bookings still signed in", async ({ page, browser }) => {
  await bookAndComeBack(page, browser);
});

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test("book, close the browser, come back to My bookings still signed in", async ({ page, browser }) => {
    await bookAndComeBack(page, browser);
  });
});
