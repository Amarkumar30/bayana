import type { Page, Route } from "@playwright/test";

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

export const MOCK_PASSWORD = "correct-horse-battery-9", MOCK_CODE = "123456";
const user = { id: "u1", email: "studio@example.in", role: "VENDOR" };
const fail = (status: number, code: string, message: string) => ({ status, json: { error: { code, message, details: {} } } });
/** Mirrors the real auth API's contract: uniform 202 for code requests, INVALID_CREDENTIALS / OTP_INVALID for bad input. */
function authRoute(route: Route, path: string) {
  const body = (route.request().postDataJSON() ?? {}) as Record<string, string>;
  if (path === "/v1/auth/otp/request") return route.fulfill({ status: 202, json: { ok: true } });
  if (path === "/v1/auth/login") return body.password !== undefined
    ? route.fulfill(body.password === MOCK_PASSWORD ? { json: { user } } : fail(401, "INVALID_CREDENTIALS", "Invalid email or password"))
    : route.fulfill(body.code === MOCK_CODE ? { json: { user } } : fail(400, "OTP_INVALID", "That code is wrong or has expired."));
  if (path === "/v1/auth/signup") return route.fulfill(body.code === MOCK_CODE ? { status: 201, json: { user } } : fail(400, "OTP_INVALID", "That code is wrong or has expired."));
  if (path === "/v1/auth/password/reset") return route.fulfill(body.code === MOCK_CODE ? { json: { user } } : fail(400, "OTP_INVALID", "That code is wrong or has expired."));
  if (path === "/v1/auth/sessions") return route.fulfill({ json: { sessions: [
    { id: "s1", created_at: "2026-10-20T10:00:00Z", last_used_at: "2026-10-24T09:00:00Z", ip: "203.0.113.5", user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", current: true },
    { id: "s2", created_at: "2026-10-18T10:00:00Z", last_used_at: "2026-10-22T19:30:00Z", ip: "198.51.100.7", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1", current: false }] } });
  return route.fulfill(fail(401, "AUTHENTICATION_REQUIRED", "Sign in is required"));
}

/** Answers the vendor API with fixed sample data; everything else is a 401 in the API's error shape. */
export async function mockApi(page: Page) {
  await page.route(`${MOCK_API_URL}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/vendor/me") return route.fulfill({ json: profile });
    if (path === "/v1/vendor/availability") return route.fulfill({ json: availability });
    if (path.startsWith("/v1/auth/")) return authRoute(route, path);
    return route.fulfill({ status: 401, json: { error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required", details: {} } } });
  });
}
