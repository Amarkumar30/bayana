import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { fakePayments } from "../playwright.live.config";
import { chooseTimeAndDetails, codeFor, publishedVendor } from "./helpers";

// Test mode with FakeProvider: the real API verifies a real HMAC signature and asks the (fake) gateway for the payment.
// Only Razorpay's checkout.js is replaced, by a stub that "pays" and signs with the fake key secret. No network, no keys.
test.skip(process.env.E2E_PAYMENTS !== "fake", "runs in the FakeProvider pass");

const stubCheckout = (secret: string) => `
window.Razorpay = function (options) { this.options = options; this.handlers = {}; };
window.Razorpay.prototype.on = function (name, handler) { this.handlers[name] = handler; };
window.Razorpay.prototype.open = async function () {
  const options = this.options;
  if (window.__checkout === "dismiss") return setTimeout(function () { options.modal.ondismiss(); }, 50);
  if (window.__checkout === "fail") this.handlers["payment.failed"]({ error: { description: "Card declined by the test bank" } });
  const paymentId = "pay_fake_" + options.order_id.replace(/^order_/, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(${JSON.stringify(secret)}), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(options.order_id + "|" + paymentId)))).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
  setTimeout(function () { options.handler({ razorpay_order_id: options.order_id, razorpay_payment_id: paymentId, razorpay_signature: signature }); }, 50);
};`;

async function reachPayStep(page: Page) {
  await page.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: stubCheckout(fakePayments.keySecret) }));
  const vendor = await publishedVendor("Pay Studio");
  const email = `e2e-payer-${randomUUID().slice(0, 8)}@example.test`;
  await page.goto(`/${vendor.slug}/book?service=${vendor.serviceId}`);
  await chooseTimeAndDetails(page, { name: "Asha Rao", email });
  const asked = Date.now() - 1000;
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(email, asked));
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(page.getByRole("heading", { name: "Pay the advance" })).toBeVisible();
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  return vendor;
}

test("a customer pays the advance in Checkout and sees confirmation only after the server verifies it", async ({ page }) => {
  await reachPayStep(page);
  await page.getByRole("button", { name: "Pay ₹2,000.00" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await expect(page.getByText("Your advance is verified.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View your booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your booking is confirmed" })).toBeVisible();
  await expect(page.getByText("Advance · paid online (card)")).toBeVisible();
  // Balance on the customer view: total minus verified payments.
  await expect(page.getByText("Balance due", { exact: true }).locator("..")).toContainText("₹6,000.00");
  const receipt = page.getByRole("link", { name: "Download receipt for ₹2,000.00" });
  const response = await page.request.get((await receipt.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
});

test("closing Checkout charges nothing, says so, and paying again still works", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __checkout: string }).__checkout = "dismiss"; });
  await reachPayStep(page);
  await page.getByRole("button", { name: "Pay ₹2,000.00" }).click();
  await expect(page.getByText("Payment window closed. Nothing was charged. You can try again while your time is held.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "You're booked" })).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { __checkout: string }).__checkout = "pay"; });
  await page.getByRole("button", { name: "Pay ₹2,000.00" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
});
