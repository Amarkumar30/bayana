import { expect, test } from "@playwright/test";
import { MOCK_API_URL, MOCK_CODE, MOCK_PASSWORD, mockApi } from "./mock-api";

// Auth screens against a mocked API that follows the real contract. The API itself is covered by apps/api/test/integration/auth.test.ts.
test.beforeEach(async ({ page }) => { await mockApi(page); });

const usePassword = async (page: import("@playwright/test").Page, url = "/login") => { await page.goto(url); await page.getByRole("button", { name: "Use password" }).click(); };

test("login validates inline and shows a human message for wrong credentials", async ({ page }) => {
  await usePassword(page);
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
  await usePassword(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const email = page.getByLabel("Email", { exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
});

test("login by password goes to the dashboard (or the safe next path)", async ({ page }) => {
  await usePassword(page, "/login?next=/dashboard/settings");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.locator("main input[name=password]").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
});

test("login ignores an off-site next parameter", async ({ page }) => {
  await usePassword(page, "/login?next=//evil.example/steal");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.locator("main input[name=password]").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("login by email code: request, wrong code, then the right one", async ({ page }) => {
  await page.goto("/login");
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

test("signup is two steps, email then code, with no password; it continues to onboarding", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your account");
  await page.getByLabel("Email", { exact: true }).fill("new@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
  await expect(page.locator("main input[type=password]")).toHaveCount(0);
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
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

test("login leads with Continue with Google, linking to the API with a safe next path", async ({ page }) => {
  await page.goto("/login?next=/dashboard/bookings");
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toHaveAttribute("href", `${MOCK_API_URL}/v1/auth/google/start?next=%2Fdashboard%2Fbookings`);
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use password" })).toBeVisible();
});

test("the Google button is hidden when the API has Google sign-in off", async ({ page }) => {
  await page.route(`${MOCK_API_URL}/v1/auth/providers`, route => route.fulfill({ json: { google: false } }));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});

test("a cancelled Google sign-in comes back with a human message", async ({ page }) => {
  await page.goto("/login?error=google_cancelled");
  await expect(page.getByText("Google sign-in was cancelled. Try again, or sign in with an email code.")).toBeVisible();
  await page.goto("/login?error=something-unknown");
  // Only the button label and the sign-up consent line under it mention Google: no stray message for an unknown code.
  await expect(page.getByText(/New to Bayana\? Continuing with Google creates your account/)).toHaveCount(1);
  await expect(page.getByText(/Google/).filter({ hasNotText: "New to Bayana? Continuing with Google" })).toHaveCount(1);
});

test("settings lists sign-in methods and lets a vendor add a password", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await page.getByRole("tab", { name: "Sign-in methods" }).click();
  await expect(page.getByText("Connected as studio@gmail.com")).toBeVisible();
  await expect(page.getByText("Always on")).toBeVisible();
  await page.getByRole("button", { name: "Add a password" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a password" });
  await dialog.getByLabel("New password").fill("short");
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog.getByText("Use at least 10 characters.")).toBeVisible();
  await dialog.getByLabel("New password").fill(MOCK_PASSWORD);
  await dialog.getByRole("button", { name: "Save password" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Set. Changing or removing it signs out your other devices.")).toBeVisible();
});

test("settings shows the result of connecting Google", async ({ page }) => {
  await page.goto("/dashboard/settings?error=google_in_use");
  await expect(page.getByText("That Google account is already connected to another Bayana account.")).toBeVisible();
});
