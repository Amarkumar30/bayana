import { expect, test, type Page } from "@playwright/test";
import { MOCK_API_URL, mockApi } from "./mock-api";
import { guardSideScroll } from "./side-scroll";

// Every screen these tests visit must fit the width (no sideways scroll), not just the last one.
guardSideScroll(test);

// The online (test) pay step with Razorpay Checkout stubbed in the browser (no network, no keys), at 375 and 1280 px:
// the test banner, Checkout opened with the order's key and the booking's prefill, a closed window and Try again, then the
// confirmed state only once the server says so. Dates are relative to today.

const id = "7f3c2a10-0001-4000-8000-0000000000aa";
const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 14 * 60_000).toISOString();
const view = (status: "PENDING" | "CONFIRMED") => ({
  id, status, service_name: "Portrait session", duration_minutes: 90, starts_at: `${day}T04:30:00.000Z`, ends_at: `${day}T06:00:00.000Z`, hold_expires_at: status === "PENDING" ? holdUntil : null, timezone: "Asia/Kolkata",
  vendor: { slug: "studio-sunday", display_name: "Studio Sunday" }, client_name: "Asha Rao", total_paise: 800000, advance_paise: 200000, paid_paise: status === "CONFIRMED" ? 200000 : 0, balance_due_paise: status === "CONFIRMED" ? 600000 : 800000,
  payments_enabled: true, payments_test: true, viewer: "customer", can_pay: status === "PENDING", read_only: false, timeline: [], refunds: [], contract: null, contract_preview: null, cancellation_tiers: [], can_cancel: false, refund_preview: null,
  payments: status === "CONFIRMED" ? [{ id: "p1", provider: "razorpay", kind: "advance", status: "captured", amount_paise: 200000, method: "upi", note: null, created_at: holdUntil, verified_at: holdUntil, receipt: true }] : []
});

/** A stand-in for checkout.js: records the options, and on open either closes the window or completes a payment. */
async function stubCheckout(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { Razorpay: unknown; __checkout: { mode: "close" | "pay"; options?: Record<string, unknown> } };
    w.__checkout = { mode: "close" };
    w.Razorpay = class {
      constructor(private options: Record<string, any>) { w.__checkout.options = options; }
      on() { /* payment.failed is not simulated here */ }
      open() {
        if (w.__checkout.mode === "close") this.options.modal.ondismiss();
        else this.options.handler({ razorpay_order_id: this.options.order_id, razorpay_payment_id: "pay_stub123", razorpay_signature: "sig" });
      }
    };
  });
}

test("pay step: the test banner, Checkout with the order's key and the booking's prefill, close and try again, then confirmed", async ({ page }) => {
  await mockApi(page); await stubCheckout(page);
  let confirmed = false;
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}`, route => route.fulfill({ json: view(confirmed ? "CONFIRMED" : "PENDING") }));
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}/payment-order`, route => route.fulfill({ json: { order_id: "order_stub1", key_id: "rzp_test_fromTheApi", amount_paise: 200000, currency: "INR", reused: false, test: true, prefill: { name: "Asha Rao", email: "asha@example.in", contact: "9820000000" } } }));
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}/payment-verify`, route => { confirmed = true; return route.fulfill({ json: { outcome: "confirmed", booking: view("CONFIRMED") } }); });

  await page.goto(`/b/${id}?t=hold-token`);
  await expect(page.getByText("Test payment: no real money will be charged.")).toBeVisible();
  // Closing the window: back on the pay step, nothing charged, and the button offers to try again.
  await page.getByRole("button", { name: "Pay ₹2,000" }).click();
  await expect(page.getByText("Payment window closed. Nothing was charged.")).toBeVisible();
  const again = page.getByRole("button", { name: "Try again: pay ₹2,000" });
  await expect(again).toBeVisible();
  const options = await page.evaluate(() => (window as unknown as { __checkout: { options: Record<string, unknown> } }).__checkout.options);
  expect(options).toMatchObject({ key: "rzp_test_fromTheApi", order_id: "order_stub1", amount: 200000, currency: "INR", prefill: { name: "Asha Rao", email: "asha@example.in", contact: "9820000000" } });
  expect(options).not.toHaveProperty("method");
  // Paying: confirmed only once the server says CONFIRMED, and the payment is labelled as a test payment.
  await page.evaluate(() => { (window as unknown as { __checkout: { mode: string } }).__checkout.mode = "pay"; });
  await again.click();
  await expect(page.getByRole("heading", { level: 1, name: "Your booking is confirmed" })).toBeVisible();
  await expect(page.getByText(/Online \(test\)/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a vendor without online payments shows no pay button and no test banner", async ({ page }) => {
  await mockApi(page);
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}`, route => route.fulfill({ json: { ...view("PENDING"), payments_enabled: false, payments_test: false, can_pay: false } }));
  await page.goto(`/b/${id}?t=hold-token`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay ₹/ })).toHaveCount(0);
  await expect(page.getByText("Test payment: no real money will be charged.")).toHaveCount(0);
});
