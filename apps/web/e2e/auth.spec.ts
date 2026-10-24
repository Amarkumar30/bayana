import { expect, test } from "@playwright/test";
import { MOCK_CODE, MOCK_PASSWORD, mockApi } from "./mock-api";

// Auth screens against a mocked API that follows the real contract. The API itself is covered by apps/api/test/integration/auth.test.ts.
test.beforeEach(async ({ page }) => { await mockApi(page); });

test("login validates inline and shows a human message for wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("studio@example");
  await page.getByLabel("Email", { exact: true }).blur();
  await expect(page.getByText("Enter an email address like name@example.com.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.locator("main input[name=password]").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("That email and password don't match");
});

test("an invalid field is marked aria-invalid and described by its error", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const email = page.getByLabel("Email", { exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
});

test("login by password goes to the dashboard (or the safe next path)", async ({ page }) => {
  await page.goto("/login?next=/dashboard/settings");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.locator("main input[name=password]").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
});

test("login ignores an off-site next parameter", async ({ page }) => {
  await page.goto("/login?next=//evil.example/steal");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.locator("main input[name=password]").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("login by email code: request, wrong code, then the right one", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email code" }).click();
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  const code = page.getByLabel("Six-digit code");
  await expect(code).toBeFocused();
  await expect(page.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();
  await code.fill("99999");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter the six-digit code from the email.")).toBeVisible();
  await code.fill("999999");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("That code is wrong or has expired");
  await code.fill(MOCK_CODE);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signup is two steps: email, then code and password together", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await page.getByLabel("Email", { exact: true }).fill("new@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await page.getByLabel("Choose a password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await page.getByLabel("Choose a password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByLabel("Choose a password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("forgot password resets by code and signs in", async ({ page }) => {
  await page.goto("/forgot");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("If an account uses this email, we've sent it a code.")).toBeVisible();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await page.getByLabel("New password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("the old /auth link redirects to /login and keeps a safe next", async ({ page }) => {
  await page.goto("/auth?next=/my-bookings");
  await expect(page).toHaveURL(/\/login\?next=%2Fmy-bookings$/);
});

test("settings lists signed-in devices from the API", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await page.getByRole("tab", { name: "Account" }).click();
  await expect(page.getByText("Chrome on Windows")).toBeVisible();
  await expect(page.getByText("Safari on iOS")).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
});
