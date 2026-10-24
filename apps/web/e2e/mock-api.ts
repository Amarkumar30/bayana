import type { Page } from "@playwright/test";

/** Reserved .invalid TLD: an unmocked request can never reach a real server. */
export const MOCK_API_URL = "http://api.bayana.invalid";

const profile = {
  slug: "studio-sunday", business_name: "Studio Sunday", description: "Event styling and portraits across Mumbai.", city: "Mumbai", service_area: "Mumbai and Thane", timezone: "Asia/Kolkata",
  terms: "Advance confirms your date.", cancellation_policy: "Full refund of advance until 7 days before.", rescheduling_policy: "One free reschedule.", phone_required: true, published: false,
  services: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Portrait session", description: "90 minutes, two outfits.", price_paise: "800000", duration_minutes: 90, booking_mode: "TIMED", advance_type: "PERCENT", advance_value: 25, active: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Event coverage", description: "Full day.", price_paise: "3500000", duration_minutes: 480, booking_mode: "FULL_DAY", advance_type: "FIXED", advance_value: 1000000, active: false }
  ]
};
const availability = { rules: [{ id: "r1", weekday: 1, start_time: "10:00:00", end_time: "18:00:00" }, { id: "r2", weekday: 3, start_time: "10:00:00", end_time: "14:00:00" }], exceptions: [], blocked_periods: [], bookings: [] };

/** Answers the vendor API with fixed sample data; everything else is a 401 in the API's error shape. */
export async function mockApi(page: Page) {
  await page.route(`${MOCK_API_URL}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/vendor/me") return route.fulfill({ json: profile });
    if (path === "/v1/vendor/availability") return route.fulfill({ json: availability });
    return route.fulfill({ status: 401, json: { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required", details: {} } } });
  });
}
