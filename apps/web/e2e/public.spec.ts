import { expect, test } from "@playwright/test";
import { MOCK_API_URL, SAMPLE_BOOKING_ID, mockApi } from "./mock-api";

// Customer-facing screens against the mocked API contract. The real end-to-end flow runs in e2e-live against the API.

test("booking stepper: service preselected, date strip, time chips, inline detail errors, then the code step", async ({ page }) => {
  await mockApi(page);
  await page.goto("/studio-sunday/book?service=11111111-1111-4111-8111-111111111111");
  await expect(page.getByText("Step 2 of 6: Time")).toBeVisible();
  const days = page.getByRole("list", { name: "Open days" }).getByRole("button");
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");
  expect(await days.count()).toBeLessThanOrEqual(14);
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 6: Details")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your name (at least 2 characters).")).toBeVisible();
  await expect(page.getByText("This business needs a phone number (at least 8 digits).")).toBeVisible();
  await page.getByLabel("Your name").fill("Asha Rao"); await page.getByLabel("Email").fill("asha@example.in"); await page.getByLabel("Phone").fill("+91 98000 00000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expect(page.getByText("Nothing is held or charged until you enter the code.")).toBeVisible();
});

test("customer booking page: contract, honest payment copy and a refund preview before cancelling", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/b/${SAMPLE_BOOKING_ID}?t=sample-token`);
  await expect(page.getByRole("heading", { level: 1, name: "Request received" })).toBeVisible();
  await expect(page.getByText("Studio Sunday has your request and will contact you to arrange the advance.", { exact: false })).toBeVisible();
  await page.getByText(/Terms you agreed to on/).click();
  await expect(page.getByTestId("contract-text")).toContainText("Advance confirms your date.");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
  await expect(dialog.getByText("Nothing has been paid yet, so there is nothing to refund.")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep my booking" }).click();
  await expect(dialog).toBeHidden();
});

test("a wrong booking link shows a private-link message, not an error code", async ({ page }) => {
  await mockApi(page);
  await page.goto("/b/9f3c2a10-0001-4000-8000-000000000009?t=nope");
  await expect(page.getByRole("heading", { name: "We couldn't find this booking" })).toBeVisible();
  await expect(page.getByText("NOT_FOUND")).toHaveCount(0);
});

test("a sleeping API (proxy 503) sends the visitor to /waking with a way back", async ({ page }) => {
  await page.route(`${MOCK_API_URL}/**`, route => route.fulfill({ status: 503, contentType: "text/html", body: "<html>Service waking</html>" }));
  await page.goto("/studio-sunday/book");
  await expect(page).toHaveURL(/\/waking\?next=%2Fstudio-sunday%2Fbook$/);
  await expect(page.getByRole("heading", { name: "Getting things ready…" })).toBeVisible();
  // Once /health answers, the visitor goes back where they were.
  await page.unroute(`${MOCK_API_URL}/**`); await mockApi(page);
  await page.route(`${MOCK_API_URL}/health`, route => route.fulfill({ json: { ok: true } }));
  await expect(page).toHaveURL(/\/studio-sunday\/book$/, { timeout: 15_000 });
});

test("a first call that takes longer than 10 seconds goes to /waking", async ({ page }) => {
  test.slow();
  await page.route(`${MOCK_API_URL}/**`, () => { /* never answers, like a host still booting */ });
  await page.goto("/studio-sunday/book");
  await expect(page).toHaveURL(/\/waking\?next=/, { timeout: 20_000 });
});
