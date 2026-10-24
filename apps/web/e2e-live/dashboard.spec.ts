import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { codeFor, mailArrived, publishedVendor } from "./helpers";

// Phase 9 against the real API and database: a vendor signs in, adds a phone booking, then cancels it with a reason.
test.skip(process.env.E2E_PAYMENTS === "fake", "runs in the payments-disabled pass");

test("a vendor adds a manual booking from the dashboard and cancels it; the customer is emailed", async ({ page }) => {
  const vendor = await publishedVendor("Dash Studio");
  const customer = `e2e-walkin-${randomUUID().slice(0, 8)}@example.test`;
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  await page.goto("/login?next=/dashboard/bookings");
  // Passwordless first: the email code is the default way in.
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(vendor.email);
  const asked = Date.now() - 1000;
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill(await codeFor(vendor.email, asked));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "All bookings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No bookings yet" })).toBeVisible();

  await page.getByRole("button", { name: "New booking" }).click();
  const dialog = page.getByRole("dialog", { name: "New booking" });
  await dialog.getByLabel("Service").selectOption({ index: 1 });
  await dialog.getByLabel("Date").fill(day);
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByLabel("Customer name").fill("Walk-in Ravi");
  await dialog.getByLabel("Customer email").fill(customer);
  await dialog.getByRole("button", { name: "Add booking" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Walk-in Ravi" })).toBeVisible();
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.getByText("Created as pending")).toBeVisible();
  expect(await mailArrived(customer, "Confirmed: Portrait session")).toBe(true);

  await page.getByRole("button", { name: "Cancel booking" }).click();
  const cancel = page.getByRole("dialog", { name: "Cancel this booking?" });
  await cancel.getByLabel("Reason").fill("Studio closed that day");
  await cancel.getByRole("button", { name: "Cancel and refund" }).click();
  await expect(cancel).toBeHidden();
  await expect(page.getByText("“Studio closed that day”")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  expect(await mailArrived(customer, "Cancelled: Portrait session")).toBe(true);
});
