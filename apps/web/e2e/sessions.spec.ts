import { expect, test, type Page } from "@playwright/test";
import { MOCK_API_URL, mockApi, publicVendor } from "./mock-api";

// Hourly services of several sessions in the browser (mocked API), at 375px and 1280px: the service form's session fields and
// live line, and the customer's "How long?" choice limited to what is free from the chosen start.

const STUDIO = { id: "55555555-5555-4555-8555-555555555555", name: "Studio time", description: "Rehearsal room with gear.", price_paise: "150000", duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, booking_mode: "hourly", min_days: null, max_days: null, buffer_days: null, min_blocks: 1, max_blocks: 4, advance_type: "PERCENT", advance_value: 30, cancellation_tiers: [], terms_template: "", customer_details_prompt: "", active: true, sort_order: 3, advance_paise: 45000, remaining_paise: 105000 };
// 10:00, 11:30 and 14:00 IST, with 3, 1 and 4 sessions free from them.
const FREE = [["04:30", 3], ["06:00", 1], ["08:30", 4]] as const;

async function studioVendor(page: Page) {
  await mockApi(page);
  await page.route(`${MOCK_API_URL}/v1/vendors/studio-sunday`, route => route.fulfill({ json: { ...publicVendor(), services: [STUDIO] } }));
  await page.route(`${MOCK_API_URL}/v1/vendors/studio-sunday/availability/slots?**`, route => {
    const date = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({ json: { timezone: "Asia/Kolkata", min_blocks: 1, max_blocks: 4, slots: FREE.map(([time, maxBlocks]) => ({ startsAt: `${date}T${time}:00.000Z`, endsAt: `${date}T${time}:00.000Z`, maxBlocks })) } });
  });
}

test("service form: per session shows length and session limits, a live line, and refuses impossible limits", async ({ page }) => {
  await mockApi(page);
  await page.goto("/dashboard/services");
  await page.getByRole("button", { name: "Add service" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add a service" });
  await expect(sheet.getByRole("radio", { name: /Per session/ })).toBeChecked();
  await expect(sheet.getByText(/per hour/i)).toHaveCount(0);
  await sheet.getByLabel("Service name").fill("Studio time");
  await sheet.getByLabel("Price (₹)").fill("1500");
  await sheet.getByLabel("Session length (minutes)").fill("60");
  await sheet.getByLabel("Minimum sessions").fill("1");
  await sheet.getByLabel("Maximum sessions").fill("4");
  await sheet.getByLabel("Advance (%)").fill("30");
  await expect(sheet.getByText("Customer can book 1 to 4 sessions of 1 hour. 3 sessions = 3 hours = ₹4,500.00. Advance ₹1,350.00.")).toBeVisible();
  await sheet.getByLabel("Maximum sessions").fill("13");
  await sheet.getByRole("button", { name: "Add service" }).click();
  await expect(sheet.getByText("At most 12 sessions.")).toBeVisible();
  await sheet.getByLabel("Minimum sessions").fill("3"); await sheet.getByLabel("Maximum sessions").fill("2");
  await expect(sheet.getByText("The maximum must be at least the minimum number of sessions.")).toBeVisible();
  // Per day hides the session fields.
  await sheet.getByRole("radio", { name: /Per day/ }).check();
  await expect(sheet.getByLabel("Minimum sessions")).toHaveCount(0);
});

test("booking flow: How long? offers only what is free from the start, the summary shows the whole range, and the hold sends start and sessions only", async ({ page }) => {
  await studioVendor(page);
  let holdBody: Record<string, unknown> | undefined;
  await page.route(`${MOCK_API_URL}/v1/auth/booking/otp/**`, route => route.fulfill({ status: 202, json: {} }));
  await page.route(`${MOCK_API_URL}/v1/bookings`, route => { holdBody = route.request().postDataJSON(); return route.fulfill({ status: 409, json: { error: { code: "SLOT_TAKEN", message: "3 sessions in a row are not free from that time. Choose fewer sessions or another time.", details: {} } } }); });
  await page.goto(`/studio-sunday/book?service=${STUDIO.id}`);
  await expect(page.getByRole("heading", { name: "Choose a date and start time" })).toBeVisible();
  await expect(page.getByText("One booking is one continuous time on one day: 1 to 4 sessions of 60 min in a row. Sessions on different days need separate bookings.")).toBeVisible();
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  const lengths = page.getByRole("group", { name: "How long, from 10:00 am?" }).getByRole("radio");
  await expect(lengths).toHaveCount(3);
  await expect(page.getByText("Longer is not free from this time. Pick an earlier start for more.")).toBeVisible();
  await page.getByRole("radio", { name: /3 sessions, 3 hours/ }).check();
  const summary = page.getByTestId("session-summary");
  await expect(summary).toContainText("10:00 am to 1:00 pm (3 hours)");
  await expect(summary).toContainText("Total ₹4,500.00");
  await expect(summary).toContainText("Advance ₹1,350.00 now");
  // A start with only one session free drops the choice back to what fits.
  await page.getByRole("list", { name: "Open times" }).getByRole("button").nth(1).click();
  await expect(page.getByRole("radio", { name: /sessions?, / })).toHaveCount(1);
  await expect(page.getByRole("radio", { name: /1 session, 1 hour/ })).toBeChecked();
  await expect(page.getByTestId("session-summary")).toHaveCount(0);
  await page.getByRole("list", { name: "Open times" }).getByRole("button").first().click();
  await page.getByRole("radio", { name: /3 sessions, 3 hours/ }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Ravi Iyer"); await page.getByLabel("Email").fill("ravi@example.test"); await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByLabel("Six-digit code").fill("123456");
  await page.getByRole("button", { name: "Verify and hold my time" }).click();
  await expect.poll(() => holdBody).toBeTruthy();
  expect(holdBody).toMatchObject({ service_id: STUDIO.id, blocks: 3 });
  expect(String(holdBody?.starts_at)).toMatch(/T04:30:00\.000Z$/);
  for (const field of ["ends_at", "total_paise", "price_paise", "duration_minutes"]) expect(holdBody).not.toHaveProperty(field);
  // A range that was just taken sends the customer back to pick a time again, with the plain customer sentence.
  await expect(page.getByText("This time was just booked by someone else. Pick another time below.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a date and start time" })).toBeVisible();
});
