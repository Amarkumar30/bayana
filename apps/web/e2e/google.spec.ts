import { expect, test } from "@playwright/test";
import { MOCK_API_URL, mockApi } from "./mock-api";

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
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute("href", `${MOCK_API_URL}/v1/auth/google/start?next=%2Fdashboard`);
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
  await expect(page.getByRole("link", { name: "Sign up with Google" })).toHaveAttribute("href", `${MOCK_API_URL}/v1/auth/google/start?next=%2Fonboarding`);
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
