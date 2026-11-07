import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { chooseTimeAndDetails, codeFor, freshIp, publishedVendor } from "./helpers";
import { guardSideScroll } from "../e2e/side-scroll";

// Every screen these tests visit must fit the width (no sideways scroll), not just the last one.
guardSideScroll(test);

// Real browser, real API, real database (*_test), real email (Mailpit). Payments are disabled, as in local and beta.
test.skip(process.env.E2E_PAYMENTS === "fake", "runs in the payments-disabled pass");

test("a stranger books from the public page to the private booking link, on a phone", async ({ page }) => {
  const vendor = await publishedVendor();
  const email = `e2e-customer-${randomUUID().slice(0, 8)}@example.test`;

  await page.goto(`/${vendor.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: vendor.displayName })).toBeVisible();
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", vendor.displayName);
  await expect(page.getByText("Online payment is not switched on", { exact: false })).toBeAttached();
  await page.getByRole("link", { name: `Book ${vendor.displayName}` }).click();

  await expect(page.getByText("Step 1 of 4: Service")).toBeVisible();
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
  await expect(page.getByText("₹2,000", { exact: true }).first()).toBeVisible();
  await page.getByText("Read the full terms").click();
  await expect(page.getByTestId("contract-text")).toContainText("Asha Rao pays ₹2,000.00 now and ₹6,000.00 on");
  // The box starts unticked and the button stays off until it is ticked.
  const agree = page.getByRole("button", { name: "Agree and send request" });
  await expect(page.getByLabel(/I agree to the terms/)).not.toBeChecked();
  await expect(agree).toBeDisabled();
  await page.getByLabel(/I agree to the terms/).check();
  await agree.click();

  // Payments disabled: honest, nothing charged.
  await expect(page.getByRole("heading", { name: `Request sent to ${vendor.displayName}` })).toBeVisible();
  await expect(page.getByText("Online payment isn't switched on", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View your booking" }).click();

  await expect(page).toHaveURL(/\/b\/[0-9a-f-]{36}\?t=/);
  await expect(page.getByRole("heading", { level: 1, name: "Request sent, awaiting advance" })).toBeVisible();
  await expect(page.getByText(/Portrait session · /)).toBeVisible();
  await page.getByText(/Terms you agreed to on/).click();
  await expect(page.getByTestId("contract-text")).toContainText("Asha Rao pays ₹2,000.00 now");
  await expect(page.getByText(/SHA-256 [0-9a-f]{64}/)).toBeVisible();

  // The private link works in a fresh browser with no session (token only); a tampered token does not.
  const url = page.url();
  const stranger = await page.context().browser()!.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": freshIp() } });
  const other = await stranger.newPage();
  await other.goto(url);
  await expect(other.getByRole("heading", { level: 1, name: "Request sent, awaiting advance" })).toBeVisible();
  await other.goto(url.replace(/t=([^&]+)/, "t=tampered"));
  await expect(other.getByRole("heading", { name: "We couldn't find this booking" })).toBeVisible();
  await stranger.close();
});

test("two phones race for the same time: exactly one holds it, the other is told kindly and offered Pick another time", async ({ browser }) => {
  const vendor = await publishedVendor("Race Studio");
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Kolkata", locale: "en-IN", extraHTTPHeaders: { "x-forwarded-for": freshIp() } })));
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
    const won = pages[index].getByRole("heading", { name: "Key terms" }), lost = pages[index].getByRole("heading", { name: "This time was just taken" });
    await expect(won.or(lost)).toBeVisible({ timeout: 20_000 });
    return await won.isVisible() ? "held" : "taken";
  };
  const results = [await outcome(0), await outcome(1)];
  expect([...results].sort()).toEqual(["held", "taken"]);
  const loser = pages[results.indexOf("taken")];
  await expect(loser.getByText("Nothing was held or charged.", { exact: false })).toBeVisible();
  await loser.getByRole("button", { name: "Pick another time" }).click();
  await expect(loser.getByText("Step 2 of 4: Time")).toBeVisible();
  await Promise.all(contexts.map(context => context.close()));
});

test("a vendor booking their own page with their business email is told to use another email, then can book", async ({ page }) => {
  const vendor = await publishedVendor("Own Studio");
  await page.goto(`/${vendor.slug}/book?service=${vendor.serviceId}`);
  await chooseTimeAndDetails(page, { name: "Studio Owner", email: vendor.email });
  const asked = Date.now() - 1000;
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(vendor.email, asked));
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  // Back on the details, with the reason and an empty, editable email; never "please sign in" and no dead "Hold" button.
  await expect(page.getByText("This email belongs to a business account on Bayana. To book as a customer, use a different email.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("");
  await expect(page.getByLabel("Email")).toBeEditable();
  await expect(page.getByText("Please sign in to continue.")).toHaveCount(0);
  const email = `e2e-other-${randomUUID().slice(0, 8)}@example.test`;
  await page.getByLabel("Email").fill(email);
  const again = Date.now() - 1000;
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(email, again));
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
});
