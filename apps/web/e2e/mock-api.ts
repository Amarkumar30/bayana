import type { Page, Route } from "@playwright/test";

/** Reserved .invalid TLD: an unmocked request can never reach a real server. */
export const MOCK_API_URL = "http://api.bayana.invalid";

type Service = Record<string, unknown> & { id: string };
const sampleServices = (): Service[] => [
  { id: "11111111-1111-4111-8111-111111111111", name: "Portrait session", description: "90 minutes, two outfits.", price_paise: "800000", duration_minutes: 90, buffer_before_minutes: 0, buffer_after_minutes: 15, booking_mode: "TIMED", advance_type: "PERCENT", advance_value: 25, cancellation_tiers: [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }], terms_template: "", customer_details_prompt: "", active: true, sort_order: 0 },
  { id: "22222222-2222-4222-8222-222222222222", name: "Event coverage", description: "Full day.", price_paise: "3500000", duration_minutes: 480, buffer_before_minutes: 0, buffer_after_minutes: 0, booking_mode: "FULL_DAY", advance_type: "FIXED", advance_value: 1000000, cancellation_tiers: [], terms_template: "", customer_details_prompt: "", active: false, sort_order: 1 }
];
const sampleProfile = () => ({
  id: "v1", slug: "studio-sunday", business_name: "Studio Sunday", description: "Event styling and portraits across Mumbai.", city: "Mumbai", service_area: "Mumbai and Thane", timezone: "Asia/Kolkata",
  terms: "Advance confirms your date.", cancellation_policy: "Full refund of advance until 7 days before.", rescheduling_policy: "One free reschedule.", phone_required: true, public_contact_email: false, public_contact_phone: false,
  published: false, min_notice_minutes: 120, max_advance_days: 90, categories: ["photography"]
});

/** In-memory vendor so multi-step flows (the wizard) see their own writes, following the real API's contract. */
export type VendorState = { profile: ReturnType<typeof sampleProfile> | null; services: Service[]; rules: { id: string; weekday: number; start_time: string; end_time: string }[]; overrides: unknown[]; blocked: unknown[] };
export const establishedVendor = (): VendorState => ({ profile: sampleProfile(), services: sampleServices(), rules: [{ id: "r1", weekday: 1, start_time: "10:00", end_time: "18:00" }, { id: "r2", weekday: 3, start_time: "10:00", end_time: "14:00" }], overrides: [], blocked: [] });
export const brandNewVendor = (): VendorState => ({ profile: null, services: [], rules: [], overrides: [], blocked: [] });

const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}) => ({ status, json: { error: { code, message, details } } });
function vendorRoute(route: Route, path: string, state: VendorState) {
  const method = route.request().method(); const body = (route.request().postDataJSON() ?? {}) as Record<string, any>;
  if (path === "/v1/vendor/me" && method === "POST") { state.profile = { ...sampleProfile(), business_name: body.business_name, slug: body.slug, city: body.city, description: body.description ?? "", terms: "", cancellation_policy: "", rescheduling_policy: "" }; return route.fulfill({ status: 201, json: state.profile }); }
  if (!state.profile) return route.fulfill(fail(404, "PROFILE_NOT_FOUND", "Create your business profile first"));
  const hasAvailability = state.rules.length > 0;
  const missing = [!state.services.some(service => service.active) && "active_service", !(state.profile.terms && state.profile.cancellation_policy && state.profile.rescheduling_policy) && "policies", !hasAvailability && "availability", !state.profile.description && "description"].filter(Boolean);
  if (path === "/v1/vendor/me" && method === "GET") return route.fulfill({ json: { ...state.profile, services: state.services } });
  if (path === "/v1/vendor/me" && method === "PATCH") { Object.assign(state.profile, body); return route.fulfill({ json: state.profile }); }
  if (path === "/v1/vendor/checklist") return route.fulfill({ json: { published: state.profile.published, missing, steps: [{ key: "service", label: "Add your first service", done: state.services.some(service => service.active) }, { key: "availability", label: "Set the hours you take bookings", done: hasAvailability }, { key: "publish", label: "Publish your booking page", done: state.profile.published }] } });
  if (path === "/v1/vendor/services" && method === "GET") return route.fulfill({ json: { services: state.services } });
  if (path === "/v1/vendor/services" && method === "POST") { const service = { id: `33333333-3333-4333-8333-${String(state.services.length).padStart(12, "0")}`, buffer_before_minutes: 0, buffer_after_minutes: 0, booking_mode: "TIMED", cancellation_tiers: [], terms_template: "", customer_details_prompt: "", active: true, sort_order: state.services.length, ...body }; state.services.push(service); return route.fulfill({ status: 201, json: service }); }
  if (path === "/v1/vendor/availability" && method === "GET") return route.fulfill({ json: { timezone: state.profile.timezone, min_notice_minutes: state.profile.min_notice_minutes, max_advance_days: state.profile.max_advance_days, rules: state.rules, overrides: state.overrides, blocked_periods: state.blocked, bookings: [] } });
  if (path === "/v1/vendor/availability/rules" && method === "PUT") { state.rules = (body.windows as { weekday: number; start_time: string; end_time: string }[]).map((window, index) => ({ id: `r${index}`, ...window })); return route.fulfill({ json: { rules: state.rules } }); }
  if (path === "/v1/vendor/publish") { if (missing.length) return route.fulfill(fail(400, "PUBLISH_CHECKLIST_INCOMPLETE", "Complete onboarding before publishing", { missing })); state.profile.published = true; return route.fulfill({ json: { published: true, missing: [] } }); }
  return route.fulfill(fail(404, "NOT_FOUND", "Not found"));
}

export const MOCK_PASSWORD = "correct-horse-battery-9", MOCK_CODE = "123456";
const user = { id: "u1", email: "studio@example.in", role: "VENDOR" };
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

export const SAMPLE_BOOKING_ID = "7f3c2a10-0001-4000-8000-000000000001";
const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
/** Public reads for the booking flow and the customer booking page, shaped like GET /v1/vendors/:slug and GET /v1/bookings/:id. */
function publicRoute(route: Route, path: string) {
  const url = new URL(route.request().url());
  if (path === "/v1/vendors/studio-sunday") return route.fulfill({ json: { ...sampleProfile(), canonical_slug: "studio-sunday", display_name: "Studio Sunday", bio: "Event styling and portraits across Mumbai.", categories: ["Photography"], payments_enabled: false, contact_email: null, contact_phone: null, services: sampleServices().filter(service => service.active).map(service => ({ ...service, advance_paise: 200000, remaining_paise: 600000 })) } });
  if (path === "/v1/vendors/studio-sunday/availability/month") return route.fulfill({ json: { timezone: "Asia/Kolkata", days: Array.from({ length: 40 }, (_, index) => ({ date: isoDay(index), available: index > 0 && index % 3 !== 0 })).filter(day => day.date.startsWith(url.searchParams.get("month") ?? "")) } });
  if (path === "/v1/vendors/studio-sunday/availability/slots") return route.fulfill({ json: { timezone: "Asia/Kolkata", slots: ["04:30", "06:00", "08:30", "10:00"].map(time => ({ startsAt: `${url.searchParams.get("date")}T${time}:00.000Z`, endsAt: `${url.searchParams.get("date")}T${time}:00.000Z` })) } });
  if (path === `/v1/bookings/${SAMPLE_BOOKING_ID}`) return route.fulfill({ json: {
    id: SAMPLE_BOOKING_ID, status: "PENDING", service_name: "Portrait session", duration_minutes: 90, starts_at: `${isoDay(9)}T04:30:00.000Z`, ends_at: `${isoDay(9)}T06:00:00.000Z`, hold_expires_at: `${isoDay(2)}T04:30:00.000Z`, timezone: "Asia/Kolkata",
    vendor: { slug: "studio-sunday", display_name: "Studio Sunday" }, client_name: "Asha Rao", total_paise: 800000, advance_paise: 200000, paid_paise: 0, balance_due_paise: 800000, payments_enabled: false, viewer: "customer",
    timeline: [{ to_status: "HELD", created_at: `${isoDay(0)}T05:00:00.000Z` }, { to_status: "PENDING", created_at: `${isoDay(0)}T05:04:00.000Z` }], payments: [],
    contract: { body: ["Booking", "Business: Studio Sunday", "Service: Portrait session", "", "Booking terms", "Advance confirms your date."].join("\n"), sha256: "a".repeat(64), accepted_at: `${isoDay(0)}T05:04:00.000Z` }, contract_preview: null,
    cancellation_tiers: [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }], can_cancel: true, refund_preview: { refund_paise: 0, refund_percent: 100, paid_paise: 0 }
  } });
  if (path.startsWith("/v1/bookings/")) return route.fulfill(fail(404, "NOT_FOUND", "Not found"));
  return route.fulfill(fail(401, "AUTHENTICATION_REQUIRED", "Sign in is required"));
}

/** Answers vendor and auth calls from in-memory state; everything else is a 401 in the API's error shape. */
export async function mockApi(page: Page, state: VendorState = establishedVendor()) {
  await page.route(`${MOCK_API_URL}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/v1/vendor/")) return vendorRoute(route, path, state);
    if (path.startsWith("/v1/auth/")) return authRoute(route, path);
    if (path.startsWith("/v1/vendors/") || path.startsWith("/v1/bookings/")) return publicRoute(route, path);
    return route.fulfill(fail(401, "AUTHENTICATION_REQUIRED", "Sign in is required"));
  });
  return state;
}
