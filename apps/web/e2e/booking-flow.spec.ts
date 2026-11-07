import { expect, test, type Page } from "@playwright/test";
import { HOLD_ID, MOCK_API_URL, MOCK_CODE, mockApi, mockCustomerFlow, publicVendor } from "./mock-api";
import { guardSideScroll } from "./side-scroll";

// Every screen these tests visit must fit the width (no sideways scroll), not just the last one.
guardSideScroll(test);

// The customer flow of four steps against the mocked API, at 375 and 1280 px: the code on the details screen holds the time
// on its own (exactly once, whatever is tapped twice or reloaded), the terms and the advance share one screen with an
// unticked box, and a time taken meanwhile says so with "Pick another time". Dates are relative to today.

const PORTRAIT = "11111111-1111-4111-8111-111111111111";
const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const start = `${day}T04:30:00.000Z`;

async function toDetails(page: Page) {
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}`);
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Asha Rao"); await page.getByLabel("Phone").fill("+91 98000 00000"); await page.getByLabel("Email").fill("asha@example.test");
}
async function sendCode(page: Page) {
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
}

test("the code holds the time on its own: countdown, terms with the box unticked and the button off until it is ticked", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page);
  await toDetails(page);
  // The summary keeps the price in view: total, the advance now and the balance later.
  await expect(page.getByTestId("booking-summary")).toContainText("Total ₹8,000 · Advance ₹2,000 now · ₹6,000 later");
  await sendCode(page);
  expect(calls.hold).toBe(0);
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await expect(page.getByText("Step 4 of 4: Review and agree")).toBeVisible();
  await expect(page.getByTestId("hold-countdown")).toContainText(/1[45]:\d\d/);
  expect(calls.hold).toBe(1);
  expect(calls.bodies[0]).toMatchObject({ service_id: PORTRAIT, name: "Asha Rao", phone: "+91 98000 00000" });
  // A refresh reopens the same hold.
  expect(new URL(page.url()).searchParams.get("resume")).toBe(HOLD_ID);
  const box = page.getByRole("checkbox", { name: /I agree to the terms with Studio Sunday/ });
  await expect(box).not.toBeChecked();
  const agree = page.getByRole("button", { name: "Agree and send request" });
  await expect(agree).toBeDisabled();
  await box.check();
  await agree.click();
  await expect(page.getByRole("heading", { name: "Request sent to Studio Sunday" })).toBeVisible();
  expect(calls.accept).toBe(1);
});

test("a double submit of the code, a reload and Back then Forward still make exactly one hold", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page);
  await toDetails(page); await sendCode(page);
  // Two submits in the same moment (a double tap or Enter twice), past the button's own disabled state.
  await page.locator("form").filter({ has: page.getByLabel("Six-digit code") }).evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  expect(calls.verify).toBe(1);
  expect(calls.hold).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  await page.goBack(); await page.goForward();
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  expect(calls.hold).toBe(1);
});

test("going back after a failed hold and asking again sends the same idempotency key, so the server can only make one hold", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page);
  // The first hold request fails on the network after the server may have made it; the customer presses "Hold my time" again.
  let first = true;
  await page.route(`${MOCK_API_URL}/v1/bookings`, route => { if (!first) return route.fallback(); first = false; calls.keys.push(route.request().headers()["idempotency-key"] ?? ""); return route.abort("connectionreset"); });
  await toDetails(page); await sendCode(page);
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await page.getByRole("button", { name: "Hold my time" }).click();
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  expect(calls.keys).toHaveLength(2);
  expect(calls.keys[1]).toBe(calls.keys[0]);
});

test("a time taken meanwhile says so, with Pick another time back to the times, and the email stays confirmed", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page, { taken: true });
  await toDetails(page); await sendCode(page);
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await expect(page.getByRole("heading", { name: "This time was just taken" })).toBeVisible();
  await expect(page.getByText("Someone else booked this time a moment ago. Nothing was held or charged.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Pick another time" }).click();
  await expect(page.getByRole("heading", { name: "Choose a date and time" })).toBeVisible();
  // Picking again holds straight away: the email is already confirmed, so no second code.
  await page.getByRole("list", { name: "Open times" }).getByRole("button").nth(1).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect.poll(() => calls.hold).toBe(2);
  expect(calls.verify).toBe(1);
  expect(calls.keys[1]).not.toBe(calls.keys[0]);
});

test("online: one tap agrees and opens the payment; a closed window offers Try again without agreeing again", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page, { payments: true });
  await page.route(`${MOCK_API_URL}/v1/vendors/studio-sunday`, route => route.fulfill({ json: { ...publicVendor(), payments_enabled: true } }));
  await page.route(`${MOCK_API_URL}/v1/bookings/${HOLD_ID}/payment-order`, route => route.fulfill({ json: { order_id: "order_stub1", key_id: "rzp_test_fromTheApi", amount_paise: 200000, currency: "INR", reused: false, test: true } }));
  await page.addInitScript(() => {
    const w = window as unknown as { Razorpay: unknown; __opened: number };
    w.__opened = 0;
    w.Razorpay = class { constructor(private options: Record<string, any>) {} on() { /* not simulated */ } open() { w.__opened++; this.options.modal.ondismiss(); } };
  });
  await toDetails(page); await sendCode(page);
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await expect(page.getByText("Step 4 of 4: Review and pay")).toBeVisible();
  // The test-payment banner shows before anyone pays.
  await expect(page.getByText("Test payment: no real money will be charged.")).toBeVisible();
  const pay = page.getByRole("button", { name: "Agree and pay ₹2,000" });
  await expect(pay).toBeDisabled();
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await pay.click();
  await expect(page.getByText("Payment window closed. Nothing was charged.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __opened: number }).__opened)).toBe(1);
  await expect(page.getByText("You agreed to these terms.")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again: pay ₹2,000" }).click();
  expect(await page.evaluate(() => (window as unknown as { __opened: number }).__opened)).toBe(2);
  expect(calls.accept).toBe(1);
});

test("back from Google with the details kept, the time is held on its own: no code and no extra button", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page, { email: "ravi.g@gmail.test" });
  await page.addInitScript(() => sessionStorage.setItem("bayana:booking-details:studio-sunday", JSON.stringify({ name: "Ravi Iyer", phone: "9876543210", notes: "Window seat" })));
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}&date=${day}&start=${encodeURIComponent(start)}&google=1`);
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  expect(calls.hold).toBe(1);
  expect(calls.bodies[0]).toMatchObject({ starts_at: start, name: "Ravi Iyer", phone: "9876543210", notes: "Window seat" });
  expect(calls.verify).toBe(0);
});

test("back from Google without a name, the details ask for it first, then one tap holds the time", async ({ page }) => {
  await mockApi(page); const calls = await mockCustomerFlow(page, { email: "ravi.g@gmail.test" });
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}&date=${day}&start=${encodeURIComponent(start)}&google=1`);
  await expect(page.getByText("ravi.g@gmail.test is confirmed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send my code" })).toHaveCount(0);
  expect(calls.hold).toBe(0);
  await page.getByRole("button", { name: "Hold my time" }).click();
  await expect(page.getByText("Enter your name (at least 2 characters).")).toBeVisible();
  await page.getByLabel("Your name").fill("Ravi Iyer"); await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Hold my time" }).click();
  await expect(page.getByRole("heading", { name: "Key terms" })).toBeVisible();
  expect(calls.hold).toBe(1);
});
