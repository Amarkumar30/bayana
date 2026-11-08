import { expect, test, type Page } from "@playwright/test";
import { MOCK_API_URL, MOCK_CODE, mockApi } from "./mock-api";
import { guardSideScroll } from "./side-scroll";

// Every screen these tests visit must fit the width (no sideways scroll), not just the last one.
guardSideScroll(test);

// Customers: "My bookings" signs in as a customer (never the vendor flow), sign-in lands by role, a customer never sees
// vendor onboarding, and an email's private link is view-only. At 375 and 1280 px, against the mocked API. Sessions that
// survive closing the browser are tested against the real API in e2e-live/customer.spec.ts.

const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const past = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
const booking = (id: string, date: string, status: string) => ({ id, status, starts_at: `${date}T04:30:00.000Z`, ends_at: `${date}T06:00:00.000Z`, booking_mode: "hourly", days_count: null, blocks_count: 1, first_date: date, timezone: "Asia/Kolkata", service_name: "Portrait session", slug: "studio-sunday", display_name: "Studio Sunday", total_paise: 800000, paid_paise: 200000, balance_due_paise: 600000, terms_accepted_at: `${date}T00:00:00.000Z` });
async function signedInCustomer(page: Page) {
  await page.route(`${MOCK_API_URL}/v1/auth/me`, route => route.fulfill({ json: { user: { id: "c1", email: "asha@example.in", role: "CLIENT" } } }));
  await page.route(`${MOCK_API_URL}/v1/client/bookings`, route => route.fulfill({ json: { bookings: [booking("7f3c2a10-0001-4000-8000-000000000011", past, "COMPLETED"), booking("7f3c2a10-0001-4000-8000-000000000012", day, "CONFIRMED")] } }));
}

test("a signed-out customer's My bookings offers the customer sign-in, not the vendor flow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  // On a phone the header links are in the menu.
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "My bookings" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Sign in to see your bookings" })).toBeVisible();
  const google = new URL((await page.getByRole("link", { name: "See my bookings with Google" }).getAttribute("href"))!);
  expect(Object.fromEntries(google.searchParams)).toEqual({ intent: "customer", next: "/my-bookings" });
  await page.getByRole("link", { name: "Use an email code instead" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmy-bookings$/);
  // Coming from My bookings, the customer path comes first on the login page.
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("I booked with someone");
});

test("a customer who signs in with an email code from My bookings lands on My bookings, never onboarding", async ({ page }) => {
  await mockApi(page);
  await page.route(`${MOCK_API_URL}/v1/auth/login`, route => route.fulfill({ json: { user: { id: "c1", email: "asha@example.in", role: "CLIENT" } } }));
  await page.goto("/login?next=/my-bookings");
  await page.getByLabel("Email", { exact: true }).fill("asha@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await signedInCustomer(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/my-bookings$/);
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
});

test("a customer signing in from the plain login page also lands on My bookings, even when asked for the dashboard", async ({ page }) => {
  await mockApi(page);
  await page.route(`${MOCK_API_URL}/v1/auth/login`, route => route.fulfill({ json: { user: { id: "c1", email: "asha@example.in", role: "CLIENT" } } }));
  await signedInCustomer(page);
  await page.goto("/login?next=/dashboard");
  await page.getByLabel("Email", { exact: true }).fill("asha@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/my-bookings$/);
});

test("a vendor still lands on the dashboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.in");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill(MOCK_CODE);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("My bookings: upcoming first, then past, each with the business, IST time, amounts and terms; and a sign-out", async ({ page }) => {
  await mockApi(page); await signedInCustomer(page);
  await page.goto("/my-bookings");
  await expect(page.getByText("Signed in as asha@example.in")).toBeVisible();
  const lists = page.getByRole("region");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Upcoming", "Past", "Your data"]);
  const upcoming = lists.filter({ has: page.getByRole("heading", { name: "Upcoming" }) });
  await expect(upcoming.getByText("Confirmed")).toBeVisible();
  await expect(upcoming.getByText(/\(IST\)/)).toBeVisible();
  await expect(upcoming.getByText(/Terms agreed on/)).toBeVisible();
  await expect(upcoming.getByRole("link", { name: "Studio Sunday" })).toHaveAttribute("href", "/studio-sunday");
  await expect(upcoming.getByRole("link", { name: "View booking and terms" })).toHaveAttribute("href", "/b/7f3c2a10-0001-4000-8000-000000000012");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a signed-in customer who opens the dashboard is told so, with My bookings, and never sent to onboarding", async ({ page }) => {
  await mockApi(page); await signedInCustomer(page);
  await page.route(`${MOCK_API_URL}/v1/vendor/**`, route => route.fulfill({ status: 401, json: { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in with a vendor account to continue", details: {} } } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "You're signed in as a customer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to My bookings" })).toHaveAttribute("href", "/my-bookings");
  await expect(page).not.toHaveURL(/onboarding/);
});

test("an email's private link is view-only until the customer confirms it's them on the same page with a code", async ({ page }) => {
  await mockApi(page);
  const id = "7f3c2a10-0001-4000-8000-000000000001";
  let confirmed = false; const sent: string[] = [];
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}`, route => {
    const view = { id, status: "CONFIRMED", service_name: "Portrait session", duration_minutes: 90, starts_at: `${day}T04:30:00.000Z`, ends_at: `${day}T06:00:00.000Z`, hold_expires_at: null, timezone: "Asia/Kolkata", vendor: { slug: "studio-sunday", display_name: "Studio Sunday" }, client_name: "Asha Rao", total_paise: 800000, advance_paise: 200000, paid_paise: 200000, balance_due_paise: 600000, payments_enabled: false, viewer: "customer", can_pay: false, read_only: true, timeline: [], payments: [], refunds: [], contract: null, contract_preview: null, cancellation_tiers: [], can_cancel: false, refund_preview: null };
    return route.fulfill({ json: { ...view, read_only: !confirmed, email_hint: confirmed ? null : "a***@example.in", can_cancel: confirmed, refund_preview: confirmed ? { refund_paise: 0, refund_percent: 0, paid_paise: 0 } : null } });
  });
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}/sign-in/code`, route => { sent.push(route.request().headers()["x-booking-token"] ?? ""); return route.fulfill({ status: 202, json: { sent_to: "a***@example.in" } }); });
  await page.route(`${MOCK_API_URL}/v1/bookings/${id}/sign-in/verify`, route => {
    if (route.request().postDataJSON().code !== "123456") return route.fulfill({ status: 400, json: { error: { code: "OTP_INVALID", message: "x", details: {} } } });
    confirmed = true; return route.fulfill({ status: 204 });
  });
  await page.goto(`/b/${id}?t=private-link-token`);
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await expect(page.getByText("confirm with a code sent to a***@example.in")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  await page.getByRole("button", { name: "Email me a code" }).click();
  expect(sent).toEqual(["private-link-token"]);
  await page.getByLabel("Six-digit code").fill("000000");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();
  await page.getByLabel("Six-digit code").fill("123456");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/b/${id}`));
});
