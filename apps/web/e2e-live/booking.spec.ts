import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { chooseTimeAndDetails, codeFor, publishedVendor } from "./helpers";

// Real browser, real API, real database (*_test), real email (Mailpit). Payments are disabled, as in local and beta.

test("a stranger books from the public page to the private booking link, on a phone", async ({ page }) => {
  const vendor = await publishedVendor();
  const email = `e2e-customer-${randomUUID().slice(0, 8)}@example.test`;

  await page.goto(`/${vendor.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: vendor.displayName })).toBeVisible();
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", vendor.displayName);
  await expect(page.getByText("Online payment is not switched on", { exact: false })).toBeAttached();
  await page.getByRole("link", { name: `Book ${vendor.displayName}` }).click();

  await expect(page.getByText("Step 1 of 6: Service")).toBeVisible();
  await page.getByRole("button", { name: /Portrait session/ }).click();
  await chooseTimeAndDetails(page, { name: "Asha Rao", email });

  const asked = Date.now() - 1000;
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(email, asked));
  await page.getByRole("button", { name: "Verify and hold my time" }).click();

  // Review: countdown and key terms above the fold, the full contract one tap away.
  await expect(page.getByTestId("hold-countdown")).toContainText(/1[45]:\d\d/);
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeInViewport();
  await expect(page.getByText("Advance to confirm", { exact: true })).toBeInViewport();
  await expect(page.getByText("₹2,000.00").first()).toBeVisible();
  await page.getByText("Read the full terms").click();
  await expect(page.getByTestId("contract-text")).toContainText("Asha Rao pays ₹2,000.00 now and ₹6,000.00 on");
  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(page.getByText("Tick the box to agree to the terms.")).toBeVisible();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Agree and continue" }).click();

  // Pay step with payments disabled: honest, nothing charged.
  await expect(page.getByRole("heading", { name: `Request sent to ${vendor.displayName}` })).toBeVisible();
  await expect(page.getByText("Online payment isn't switched on", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View your booking" }).click();

  await expect(page).toHaveURL(/\/b\/[0-9a-f-]{36}\?t=/);
  await expect(page.getByRole("heading", { level: 1, name: "Request received" })).toBeVisible();
  await expect(page.getByText(/Portrait session · /)).toBeVisible();
  await page.getByText(/Terms you agreed to on/).click();
  await expect(page.getByTestId("contract-text")).toContainText("Asha Rao pays ₹2,000.00 now");
  await expect(page.getByText(/SHA-256 [0-9a-f]{64}/)).toBeVisible();

  // The private link works in a fresh browser with no session (token only); a tampered token does not.
  const url = page.url();
  const stranger = await page.context().browser()!.newContext({ viewport: { width: 375, height: 812 } });
  const other = await stranger.newPage();
  await other.goto(url);
  await expect(other.getByRole("heading", { level: 1, name: "Request received" })).toBeVisible();
  await other.goto(url.replace(/t=([^&]+)/, "t=tampered"));
  await expect(other.getByRole("heading", { name: "We couldn't find this booking" })).toBeVisible();
  await stranger.close();
});

test("two phones race for the same time: exactly one holds it, the other is told kindly and sent back to pick again", async ({ browser }) => {
  const vendor = await publishedVendor("Race Studio");
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Kolkata", locale: "en-IN" })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const emails = pages.map(() => `e2e-racer-${randomUUID().slice(0, 8)}@example.test`);
  const asked = Date.now() - 1000;
  for (const [index, page] of pages.entries()) {
    await page.goto(`/${vendor.slug}/book?service=${vendor.serviceId}`);
    await chooseTimeAndDetails(page, { name: `Racer ${index + 1}`, email: emails[index] });
    await page.getByRole("button", { name: "Send my code" }).click();
  }
  for (const [index, page] of pages.entries()) await page.getByLabel("Six-digit code").fill(await codeFor(emails[index], asked));

  await Promise.all(pages.map(page => page.getByRole("button", { name: "Verify and hold my time" }).click()));

  const outcome = async (index: number) => {
    const won = pages[index].getByRole("heading", { name: "Key terms" }), lost = pages[index].getByText("This time was just booked by someone else. Pick another time below.");
    await expect(won.or(lost)).toBeVisible({ timeout: 20_000 });
    return await won.isVisible() ? "held" : "taken";
  };
  const results = [await outcome(0), await outcome(1)];
  expect([...results].sort()).toEqual(["held", "taken"]);
  const loser = pages[results.indexOf("taken")];
  await expect(loser.getByText("Step 2 of 6: Time")).toBeVisible();
  await Promise.all(contexts.map(context => context.close()));
});
