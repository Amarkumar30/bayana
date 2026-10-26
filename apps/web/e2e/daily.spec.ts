import { expect, test } from "@playwright/test";
import { DAILY_PUBLIC_SERVICE, mockApi, mockDayStatus } from "./mock-api";

// Per-day services in the browser (mocked API), at 375px and 1280px: the service form's mode switch and the day picker.

test("service form: choosing per day swaps duration for days and shows the live price line", async ({ page }) => {
  await mockApi(page);
  await page.goto("/dashboard/services");
  await page.getByRole("button", { name: "Add service" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a service" });
  await expect(sheet.getByRole("radio", { name: /Per hour/ })).toBeChecked();
  await expect(sheet.getByLabel("Duration (minutes)")).toBeVisible();
  await sheet.getByRole("radio", { name: /Per day/ }).check();
  await expect(sheet.getByLabel("Duration (minutes)")).toHaveCount(0);
  await sheet.getByLabel("Service name").fill("Wedding day");
  await sheet.getByLabel("Price per day (₹)").fill("12000");
  await sheet.getByLabel("Minimum days").fill("1");
  await sheet.getByLabel("Maximum days").fill("3");
  await expect(sheet.getByText("Customer pays ₹12,000.00 per day. 2 days = ₹24,000.00. Advance ₹6,000.00.")).toBeVisible();
  // Inline validation with the shared schema: the maximum below the minimum is refused before anything is sent.
  await sheet.getByLabel("Minimum days").fill("4");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet.getByText("The maximum must be at least the minimum number of days.")).toBeVisible();
  await sheet.getByRole("radio", { name: /Per hour/ }).check();
  await expect(sheet.getByLabel("Duration (minutes)")).toBeVisible();
  await expect(sheet.getByLabel("Minimum days")).toHaveCount(0);
});

test("day picker: dates show why they are unavailable, days are limited to what is free, and the summary prices the range", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/studio-sunday/book?service=${DAILY_PUBLIC_SERVICE.id}`);
  await expect(page.getByRole("heading", { name: "Choose your dates" })).toBeVisible();
  await expect(page.getByText("Step 2 of 6: Dates · Days in Asia/Kolkata")).toBeVisible();
  for (const label of ["Booked", "Closed", "Past or too soon"]) await expect(page.getByRole("list", { name: "Why some dates cannot be chosen" }).getByText(label)).toBeVisible();
  // The first free date with three free days after it (offsets 1, 2: available; 3: closed; so offset 6 starts 6, 7, 8 = free).
  let offset = 1; while (!(mockDayStatus(offset) === "available" && mockDayStatus(offset + 1) === "available" && mockDayStatus(offset + 2) === "available")) offset++;
  const start = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  if (start.slice(0, 7) !== new Date().toISOString().slice(0, 7)) await page.getByRole("button", { name: "Next month" }).click();
  // Today (offset 0) is past: its button is disabled and says why.
  const today = new Date().toISOString().slice(0, 10);
  if (start.slice(0, 7) === today.slice(0, 7)) await expect(page.locator(`[data-date="${today}"]`)).toBeDisabled();
  await page.locator(`[data-date="${start}"]`).click();
  const choices = page.getByRole("radiogroup", { name: "Number of days" }).getByRole("radio");
  await expect(choices).toHaveText(["1 day", "2 days", "3 days"]);
  await page.getByRole("radio", { name: "2 days" }).click();
  const summary = page.getByTestId("day-summary");
  await expect(summary).toContainText("(2 days)");
  await expect(summary).toContainText("Total ₹24,000.00");
  await expect(summary).toContainText("Advance ₹6,000.00 now");
  await expect(summary).not.toContainText(/\d:\d\d/);
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  // Nothing on the step scrolls sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
