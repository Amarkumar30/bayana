import { expect, test } from "@playwright/test";
import { brandNewVendor, establishedVendor, mockApi } from "./mock-api";

// Vendor setup screens against a mocked API that follows the real contract (covered for real in apps/api/test/integration/vendor.test.ts).

test("a vendor with no profile is sent to setup, never shown an empty table", async ({ page }) => {
  await mockApi(page, brandNewVendor());
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Let's set up your booking page" })).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
});

test("a new vendor sees the three-step checklist on the dashboard", async ({ page }) => {
  const state = establishedVendor(); state.services = []; state.rules = [];
  await mockApi(page, state);
  await page.goto("/dashboard");
  const steps = page.getByRole("listitem").filter({ hasText: /^\d\./ });
  await expect(page.getByRole("heading", { name: "Get your booking page live" })).toBeVisible();
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("Add your first service");
  await expect(steps.nth(0).getByRole("link", { name: "Add a service" })).toHaveAttribute("href", "/dashboard/services");
});

test("onboarding wizard: profile, first service, hours, publish", async ({ page, baseURL }) => {
  const state = await mockApi(page, brandNewVendor());
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Tell clients who you are" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Use at least 2 characters.").first()).toBeVisible();
  await page.getByLabel("Business name").fill("Studio Sunday");
  await expect(page.getByLabel("Your link")).toHaveValue("studio-sunday");
  await page.getByLabel("Your link").fill("login");
  await expect(page.getByText("That address is reserved. Try another.")).toBeVisible();
  await page.getByLabel("Your link").fill("studio-sunday");
  await page.getByLabel("City").fill("Mumbai");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Add your first service" })).toBeVisible();
  await page.getByLabel("Service name").fill("Portrait session");
  await page.getByLabel("Price (₹)").fill("2500");
  await page.getByLabel("Advance (%)").fill("120");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("A percentage advance must be between 1 and 100.").first()).toBeVisible();
  await page.getByLabel("Advance (%)").fill("20");
  await expect(page.getByText("Customers pay ₹500.00 now and ₹2,000.00 later.")).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "When do you take bookings?" })).toBeVisible();
  await page.getByRole("button", { name: "Sat" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  expect(state.rules.map(rule => rule.weekday)).toEqual([1, 2, 3, 4, 5, 6]);

  await expect(page.getByRole("heading", { name: "Your terms, then publish" })).toBeVisible();
  await page.getByRole("button", { name: "Publish my page" }).click();
  await expect(page.getByText("Write your booking terms, cancellation and rescheduling policies")).toBeVisible();
  await page.getByLabel("Short description").fill("Portraits in Mumbai.");
  await page.getByLabel("Booking terms").fill("The advance confirms your date.");
  await page.getByLabel("Cancellation policy").fill("Full refund 7 days before.");
  await page.getByLabel("Rescheduling policy").fill("One free reschedule.");
  await page.getByRole("button", { name: "Publish my page" }).click();
  await expect(page.getByRole("heading", { name: "Your page is live" })).toBeVisible();
  // The link is built from NEXT_PUBLIC_SITE_URL (the test server's origin here, https://bayana.in in production).
  await expect(page.getByText(`${new URL(baseURL!).host}/studio-sunday`)).toBeVisible();
});

test("services page lists services and validates the advance before saving", async ({ page }) => {
  await mockApi(page);
  await page.goto("/dashboard/services");
  await expect(page.getByText("Portrait session")).toBeVisible();
  await expect(page.getByText("2 refund tiers")).toBeVisible();
  await page.getByRole("button", { name: "Add service" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a service" });
  await sheet.getByLabel("Service name").fill("Mini session");
  await sheet.getByLabel("Price (₹)").fill("1000");
  await sheet.getByLabel("Advance", { exact: true }).selectOption("FIXED");
  await sheet.getByLabel("Advance (₹)").fill("1500");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet.getByText("A fixed advance cannot be more than the price.").first()).toBeVisible();
  await sheet.getByLabel("Advance (₹)").fill("300");
  await sheet.getByRole("button", { name: "Add a tier" }).click();
  await sheet.getByLabel("Hours before (tier 1)").fill("48"); await sheet.getByLabel("Refund %").fill("50");
  await sheet.getByLabel("Terms for this service").fill("Pay {{prise}}");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet.getByText(/Unknown variable \{\{prise\}\}/)).toBeVisible();
  await sheet.getByLabel("Terms for this service").fill("");
  await sheet.getByRole("button", { name: "{{advance}}" }).click();
  await expect(sheet.getByLabel("Terms for this service")).toHaveValue("{{advance}}");
  await sheet.getByRole("button", { name: "Add service" }).click();
  // The "Mini session saved" toast may still be up, so look for the row itself.
  await expect(page.locator("strong", { hasText: "Mini session" })).toBeVisible();
});

test("a vendor with no services gets step 1, not an empty table", async ({ page }) => {
  const state = establishedVendor(); state.services = [];
  await mockApi(page, state);
  await page.goto("/dashboard/services");
  await expect(page.getByRole("heading", { name: "Step 1: add your first service" })).toBeVisible();
});

test("availability page edits weekly windows and warns on overlap", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/dashboard/availability");
  await expect(page.getByText("Asia/Kolkata")).toBeVisible();
  const monday = page.getByRole("listitem").filter({ hasText: "Monday" });
  await monday.getByRole("button", { name: "Add hours" }).click();
  await monday.getByLabel("From").nth(1).fill("12:00");
  await expect(page.getByText("Two windows overlap on Monday.").first()).toBeVisible();
  await monday.getByLabel("From").nth(1).fill("18:30"); await monday.getByLabel("To").nth(1).fill("20:00");
  await page.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(page.getByText("Weekly hours saved").first()).toBeVisible();
  expect(state.rules.filter(rule => rule.weekday === 1).map(rule => [rule.start_time, rule.end_time])).toEqual([["10:00", "18:00"], ["18:30", "20:00"]]);
});
