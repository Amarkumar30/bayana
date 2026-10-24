import { expect, test } from "@playwright/test";
import { MOCK_API_URL, MOCK_CODE, MOCK_NOW, establishedVendor, mockApi } from "./mock-api";

// Phase 9 dashboard and admin flows against the mocked API (the real routes are covered in apps/api/test/integration/dashboard-admin.test.ts).
const PENDING_ID = "7f3c2a10-0002-4000-8000-000000000002";
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(MOCK_NOW); });

test("bookings list opens a booking; cancelling needs a reason and refunds in full", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/dashboard/bookings");
  await page.getByRole("link", { name: /Rohit Malhotra/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Rohit Malhotra" })).toBeVisible();
  await expect(page.getByText("Collect the ₹2,000.00 advance and record it below")).toBeVisible();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
  await dialog.getByRole("button", { name: "Cancel and refund" }).click();
  await expect(dialog.getByText("Tell the customer why, in a few words.")).toBeVisible();
  await dialog.getByLabel("Reason").fill("Studio flooded");
  await dialog.getByRole("button", { name: "Cancel and refund" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  expect(state.bookings.find(booking => booking.id === PENDING_ID)?.status).toBe("CANCELLED");
});

test("a manual booking validates inline, then opens the new booking", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/dashboard/bookings");
  await page.getByRole("button", { name: "New booking" }).click();
  const dialog = page.getByRole("dialog", { name: "New booking" });
  await dialog.getByRole("button", { name: "Add booking" }).click();
  await expect(dialog.getByText("Choose a service.")).toBeVisible();
  await expect(dialog.getByText("Enter a valid email address.")).toBeVisible();
  await dialog.getByLabel("Service").selectOption({ label: "Portrait session · ₹8,000.00 · 90 min" });
  await dialog.getByLabel("Date").fill("2026-11-06");
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByLabel("Customer name").fill("Walk-in Ravi");
  await dialog.getByLabel("Customer email").fill("ravi@example.in");
  await dialog.getByRole("button", { name: "Add booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Walk-in Ravi" })).toBeVisible();
  expect(state.bookings.at(-1)).toMatchObject({ client_name: "Walk-in Ravi", status: "CONFIRMED" });
});

test("calendar shows the month colour-coded, a day opens its details, and time can be blocked", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/dashboard/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "November 2026" })).toBeVisible();
  await page.getByRole("button", { name: /Tuesday,? 10 November, 1 item/ }).click();
  const sheet = page.getByRole("dialog", { name: /Tuesday,? 10 November/ });
  await expect(sheet.getByText("Family function")).toBeVisible();
  await sheet.getByLabel("Close").click();
  await page.getByRole("button", { name: /Wednesday,? 4 November, nothing booked/ }).click();
  const day = page.getByRole("dialog", { name: /Wednesday,? 4 November/ });
  await day.getByLabel("Reason").fill("Dentist");
  await day.getByRole("button", { name: "Block this time" }).click();
  await expect(day.getByText(/Dentist/)).toBeVisible();
  await day.getByLabel("Close").click();
  await expect(day).toBeHidden();
  expect(state.blocked.at(-1)).toMatchObject({ starts_at: "2026-11-04T07:30:00.000Z", ends_at: "2026-11-04T08:30:00.000Z", reason: "Dentist" });
  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page.getByRole("link", { name: /Ananya Iyer/ })).toBeVisible();
});

test("admin: a new admin must set up the authenticator before seeing anything", async ({ page }) => {
  const state = establishedVendor(); state.admin = { enrolled: false, verified: false };
  await mockApi(page, state);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Set up your authenticator" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Health" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start setup" }).click();
  await expect(page.getByLabel("Setup key")).toHaveText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText("That code is wrong or was already used.")).toBeVisible();
  await page.getByLabel("6-digit code").fill(MOCK_CODE);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Health" })).toBeVisible();
});

test("admin: someone who is not an admin sees an ordinary not-found page", async ({ page }) => {
  await mockApi(page);
  await page.route(`${MOCK_API_URL}/v1/admin/**`, route => route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Not found", details: {} } } }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("gate: an admin finds a stuck booking, reads why, and fixes it without SQL", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin");
  await page.getByRole("searchbox", { name: "Search" }).fill("rohit@example.in");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings\?q=rohit/);
  await page.locator(`a[href="/admin/bookings/${PENDING_ID}"]:visible`).first().click();
  await expect(page.getByText("Order order_Mock123 is open; no captured payment is recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Re-verify with Razorpay" }).click();
  await expect(page.getByText("Done: confirmed.")).toBeVisible();
  await expect(page.getByText("Nothing looks stuck. Status CONFIRMED.")).toBeVisible();
});
