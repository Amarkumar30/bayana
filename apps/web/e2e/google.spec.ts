import { expect, test, type Page } from "@playwright/test";
import { DAILY_PUBLIC_SERVICE, MOCK_API_URL, mockApi, mockDayStatus, publicVendor } from "./mock-api";
import { guardSideScroll } from "./side-scroll";

// Every screen these tests visit must fit the width (no sideways scroll), not just the last one.
guardSideScroll(test);

// "Continue with Google" for vendors and customers, against the mocked API, at 375px and 1280px. The API side (intent, state,
// nonce, PKCE, the customer proof) is covered by apps/api/test/integration/google.test.ts.

const PORTRAIT = "11111111-1111-4111-8111-111111111111";
const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
const start = `${day}T04:30:00.000Z`;

test("the button shows when Google is on, and a failed check shows it with a retry instead of hiding it", async ({ page }) => {
  await mockApi(page);
  let answer: "fail" | "on" = "fail";
  await page.route(`${MOCK_API_URL}/v1/auth/providers`, route => answer === "fail" ? route.abort("connectionrefused") : route.fulfill({ json: { google: true } }));
  await page.goto("/login");
  const google = page.getByRole("link", { name: "Open my dashboard with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("href", `${MOCK_API_URL}/v1/auth/google/start?next=%2Fdashboard`);
  // The note shows once, not under each of the two Google buttons.
  await expect(page.getByText("We couldn't check Google sign-in just now.")).toHaveCount(1);
  await expect(page.getByText("We couldn't check Google sign-in just now.")).toBeVisible();
  // A failure is not remembered: checking again finds Google on and the note goes away.
  answer = "on";
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("We couldn't check Google sign-in just now.")).toHaveCount(0);
  await expect(google).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
});

test("sign-up offers Google above the email code, with an or divider", async ({ page }) => {
  await mockApi(page);
  await page.goto("/signup");
  // mode=signup: the deliberate vendor sign-up, the only Google path that may turn a customer into a vendor.
  await expect(page.getByRole("link", { name: "Sign up with Google" })).toHaveAttribute("href", `${MOCK_API_URL}/v1/auth/google/start?next=%2Fonboarding&mode=signup`);
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
});

test("booking: the verify step offers Google for customers, carrying the chosen time in an allow-listed return path", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}`);
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Ravi Iyer"); await page.getByLabel("Email").fill("ravi@example.test"); await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Continue" }).click();
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(page.getByRole("button", { name: "Send my code" })).toBeVisible();
  const href = new URL((await google.getAttribute("href"))!);
  expect(`${href.origin}${href.pathname}`).toBe(`${MOCK_API_URL}/v1/auth/google/start`);
  expect(href.searchParams.get("intent")).toBe("customer");
  const next = new URL(href.searchParams.get("next")!, "https://bayana.invalid");
  expect(next.pathname).toBe("/studio-sunday/book");
  expect(Object.fromEntries(next.searchParams)).toMatchObject({ service: PORTRAIT, google: "1" });
  expect(next.searchParams.get("start")).toMatch(/T\d{2}:\d{2}:00\.000Z$/);
  // Leaving for Google keeps the typed details in this tab only.
  await page.route(`${MOCK_API_URL}/v1/auth/google/start**`, route => route.fulfill({ status: 200, body: "left for Google" }));
  await google.click();
  await expect(page.getByText("left for Google")).toBeVisible();
  // sessionStorage belongs to the site's origin: read it back there.
  await page.goBack();
  expect(await page.evaluate(() => sessionStorage.getItem("bayana:booking-details:studio-sunday"))).toBe(JSON.stringify({ name: "Ravi Iyer", phone: "9876543210", notes: "" }));
});

test("booking: back from Google, the selection and details are restored, the email is the verified one, and no code is asked", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => sessionStorage.setItem("bayana:booking-details:studio-sunday", JSON.stringify({ name: "Ravi Iyer", phone: "9876543210", notes: "Window seat" })));
  await page.route(`${MOCK_API_URL}/v1/auth/me`, route => route.fulfill({ json: { user: { id: "u-1", email: "ravi.g@gmail.test", role: "CLIENT" } } }));
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}&date=${day}&start=${encodeURIComponent(start)}&google=1`);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await expect(page.getByText("ravi.g@gmail.test is verified.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hold this time" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send my code" })).toHaveCount(0);
  await expect(page.getByText("Portrait session")).toBeVisible();
  // The address bar no longer carries the Google marker, so a reload does not repeat the return.
  expect(new URL(page.url()).search).toBe(`?service=${PORTRAIT}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("booking: a Google error comes back as a sentence on the verify step, with the email code still there", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => sessionStorage.setItem("bayana:booking-details:studio-sunday", JSON.stringify({ name: "Ravi Iyer", phone: "9876543210", notes: "" })));
  await page.goto(`/studio-sunday/book?service=${PORTRAIT}&date=${day}&start=${encodeURIComponent(start)}&google_error=google_unverified`);
  await expect(page.getByText("Google hasn't verified that email address yet. Sign in with an email code instead.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
});

test("booking: a tampered return path restores nothing and starts over cleanly", async ({ page }) => {
  await mockApi(page);
  await page.goto(`/studio-sunday/book?service=not-a-uuid&start=javascript:alert(1)&google=1`);
  await expect(page.getByText("Your choice could not be restored. Please choose the service and time again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible();
});

// The two largest selections a customer can carry through Google: several sessions, and a range of days.
const STUDIO = { id: "55555555-5555-4555-8555-555555555555", name: "Studio time", description: "Rehearsal room.", price_paise: "150000", duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, booking_mode: "hourly", min_days: null, max_days: null, buffer_days: null, min_blocks: 1, max_blocks: 4, advance_type: "NONE", advance_value: 0, cancellation_tiers: [], terms_template: "", customer_details_prompt: "", active: true, sort_order: 3, advance_paise: 0, remaining_paise: 150000 };
async function withStudio(page: Page) {
  await page.route(`${MOCK_API_URL}/v1/vendors/studio-sunday`, route => route.fulfill({ json: { ...publicVendor(), services: [STUDIO, DAILY_PUBLIC_SERVICE] } }));
  await page.route(`${MOCK_API_URL}/v1/vendors/studio-sunday/availability/slots?**`, route => {
    const date = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({ json: { timezone: "Asia/Kolkata", min_blocks: 1, max_blocks: 4, slots: [{ startsAt: `${date}T04:30:00.000Z`, endsAt: `${date}T05:30:00.000Z`, maxBlocks: 3 }] } });
  });
}
/** Fills the details step, reads the Google link at the verify step, and checks the return path carries no personal data. */
async function googleNextAfterDetails(page: Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Ravi Iyer"); await page.getByLabel("Email").fill("ravi@example.test"); await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Continue" }).click();
  const href = new URL((await page.getByRole("link", { name: "Continue with Google" }).getAttribute("href"))!);
  expect(href.searchParams.get("intent")).toBe("customer");
  const next = href.searchParams.get("next")!;
  for (const personal of ["Ravi", "ravi@", "9876543210", "name=", "phone=", "email="]) expect(next).not.toContain(personal);
  await page.route(`${MOCK_API_URL}/v1/auth/google/start**`, route => route.fulfill({ status: 200, body: "left for Google" }));
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page.getByText("left for Google")).toBeVisible();
  await page.goBack();
  return next;
}
/** Back from Google the way the API redirects: the same return path, signed in as the customer. */
async function returnFromGoogle(page: Page, next: string) {
  await page.route(`${MOCK_API_URL}/v1/auth/me`, route => route.fulfill({ json: { user: { id: "u-1", email: "ravi.g@gmail.test", role: "CLIENT" } } }));
  await page.goto(next);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await expect(page.getByText("ravi.g@gmail.test is verified.")).toBeVisible();
}

test("Google for a 3-session booking: the sessions go to Google and come back intact", async ({ page }) => {
  await mockApi(page); await withStudio(page);
  await page.goto(`/studio-sunday/book?service=${STUDIO.id}`);
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  await page.getByRole("radio", { name: /3 sessions, 3 hours/ }).check();
  const next = await googleNextAfterDetails(page);
  const url = new URL(next, "https://x.invalid");
  expect(url.pathname).toBe("/studio-sunday/book");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ service: STUDIO.id, blocks: "3", google: "1" });
  await returnFromGoogle(page, next);
  await expect(page.getByText(/10:00 am to 1:00 pm/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hold this time" })).toBeVisible();
});

test("Google for a 3-day booking: the dates go to Google and come back intact", async ({ page }) => {
  await mockApi(page); await withStudio(page);
  await page.goto(`/studio-sunday/book?service=${DAILY_PUBLIC_SERVICE.id}`);
  // The first date with three free days after it, chosen relative to today (as in daily.spec.ts).
  let offset = 1; while (!(mockDayStatus(offset) === "available" && mockDayStatus(offset + 1) === "available" && mockDayStatus(offset + 2) === "available")) offset++;
  const start = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  if (start.slice(0, 7) !== new Date().toISOString().slice(0, 7)) await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.locator(`[data-date="${start}"]`).click();
  await page.getByRole("radio", { name: "3 days" }).click();
  const next = await googleNextAfterDetails(page);
  expect(Object.fromEntries(new URL(next, "https://x.invalid").searchParams)).toMatchObject({ service: DAILY_PUBLIC_SERVICE.id, date: start, days: "3", google: "1" });
  await returnFromGoogle(page, next);
  await expect(page.getByText(/\(3 days\)/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hold this time" })).toBeVisible();
});

test("a refused Google start comes back to the booking page with a sentence, and the email code is still there", async ({ page }) => {
  await mockApi(page);
  await page.goto("/studio-sunday/book?google_error=google_customer_failed");
  await expect(page.getByText("We couldn't use Google just now. Please confirm your email with a code. Please choose the service and time again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible();
});
