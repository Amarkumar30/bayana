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

/** The visual specs pin the browser clock here (Monday 2 November 2026, 09:30 in Kolkata) so dated content is stable. */
export const MOCK_NOW = new Date("2026-11-02T04:00:00.000Z");
export type MockBooking = { id: string; status: string; client_name: string; client_email: string; service_name: string; starts_at: string; ends_at: string; total_paise: number; advance_paise: number; paid_paise: number };
const booking = (n: number, client: string, service: string, status: string, startsAt: string, minutes: number, total: number, advance: number, paid: number): MockBooking =>
  ({ id: `7f3c2a10-000${n}-4000-8000-00000000000${n}`, status, client_name: client, client_email: `${client.split(" ")[0].toLowerCase()}@example.in`, service_name: service, starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(), total_paise: total, advance_paise: advance, paid_paise: paid });
const sampleBookings = (): MockBooking[] => [
  booking(1, "Ananya Iyer", "Portrait session", "CONFIRMED", "2026-11-02T04:30:00.000Z", 90, 800000, 200000, 200000),
  booking(2, "Rohit Malhotra", "Portrait session", "PENDING", "2026-11-03T10:00:00.000Z", 90, 800000, 200000, 0),
  booking(3, "Fatima Shaikh", "Portrait session", "CONFIRMED", "2026-11-05T11:30:00.000Z", 90, 800000, 200000, 200000),
  booking(4, "Karthik Rao", "Portrait session", "COMPLETED", "2026-10-31T05:30:00.000Z", 90, 800000, 200000, 800000),
  booking(5, "Meera Joshi", "Portrait session", "CANCELLED", "2026-10-30T01:30:00.000Z", 90, 800000, 200000, 0)
];

/** In-memory vendor so multi-step flows (the wizard, dashboard actions) see their own writes, following the real API's contract. */
export type VendorState = { profile: ReturnType<typeof sampleProfile> | null; services: Service[]; rules: { id: string; weekday: number; start_time: string; end_time: string }[]; overrides: unknown[]; blocked: { id: string; starts_at: string; ends_at: string; reason: string }[]; bookings: MockBooking[]; admin: { enrolled: boolean; verified: boolean } };
export const establishedVendor = (): VendorState => ({ profile: sampleProfile(), services: sampleServices(), rules: [{ id: "r1", weekday: 1, start_time: "10:00", end_time: "18:00" }, { id: "r2", weekday: 3, start_time: "10:00", end_time: "14:00" }], overrides: [], blocked: [{ id: "b-off-1", starts_at: "2026-11-09T18:30:00.000Z", ends_at: "2026-11-10T18:30:00.000Z", reason: "Family function" }], bookings: sampleBookings(), admin: { enrolled: true, verified: true } });
export const brandNewVendor = (): VendorState => ({ profile: null, services: [], rules: [], overrides: [], blocked: [], bookings: [], admin: { enrolled: false, verified: false } });

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
  const dashboard = dashboardRoute(route, path, method, body, state);
  if (dashboard) return dashboard;
  if (path === "/v1/vendor/publish") { if (missing.length) return route.fulfill(fail(400, "PUBLISH_CHECKLIST_INCOMPLETE", "Complete onboarding before publishing", { missing })); state.profile.published = true; return route.fulfill({ json: { published: true, missing: [] } }); }
  return route.fulfill(fail(404, "NOT_FOUND", "Not found"));
}

const tz = "Asia/Kolkata";
function detailFor(b: MockBooking, state: VendorState) {
  const ended = new Date(b.ends_at) < MOCK_NOW, active = ["PENDING", "CONFIRMED"].includes(b.status);
  return {
    ...b, duration_minutes: 90, hold_expires_at: b.status === "PENDING" ? "2026-11-04T04:30:00.000Z" : null, timezone: tz, vendor: { slug: state.profile?.slug ?? "studio-sunday", display_name: state.profile?.business_name ?? "Studio Sunday" },
    balance_due_paise: b.total_paise - b.paid_paise, payments_enabled: false, viewer: "vendor", can_pay: false, can_cancel: active, refund_preview: null, contract_preview: null,
    timeline: [{ to_status: "HELD", created_at: "2026-10-20T05:00:00.000Z" }, { to_status: b.status, created_at: "2026-10-20T05:04:00.000Z" }],
    payments: b.paid_paise ? [{ id: `p-${b.id}`, provider: "offline", kind: "advance", status: "captured", amount_paise: b.paid_paise, method: "upi", note: "UPI ref 4411", created_at: "2026-10-20T06:00:00.000Z", verified_at: "2026-10-20T06:00:00.000Z", receipt: true }] : [],
    refunds: [], cancellation_tiers: [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }],
    contract: { body: ["Booking", "Business: Studio Sunday", `Service: ${b.service_name}`, "", "Booking terms", "Advance confirms your date."].join("\n"), sha256: "a".repeat(64), accepted_at: "2026-10-20T05:04:00.000Z" },
    customer: { name: b.client_name, email: b.client_email, phone: "9820000000", notes: "Two outfits, outdoor if the weather is good.", referral: "Instagram" }, created_at: "2026-10-20T05:00:00.000Z",
    events: [{ from_status: null, to_status: "HELD", actor: "client", reason: "slot held", meta: {}, created_at: "2026-10-20T05:00:00.000Z" }, { from_status: "HELD", to_status: b.status === "CANCELLED" ? "CANCELLED" : "PENDING", actor: b.status === "CANCELLED" ? "vendor" : "client", reason: b.status === "CANCELLED" ? "Studio closed for repairs" : "terms accepted", meta: {}, created_at: "2026-10-20T05:04:00.000Z" }],
    ledger: [], actions: { cancel: active, complete: b.status === "CONFIRMED" && ended, reschedule: active && new Date(b.starts_at) > MOCK_NOW, record_payment: ["PENDING", "CONFIRMED", "COMPLETED"].includes(b.status) && b.total_paise > b.paid_paise }
  };
}
const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
/** The Phase 9 dashboard endpoints (apps/api/src/dashboard-routes.ts), answered from VendorState. */
function dashboardRoute(route: Route, path: string, method: string, body: Record<string, any>, state: VendorState) {
  const url = new URL(route.request().url()); const rows = state.bookings;
  const row = (b: MockBooking) => ({ id: b.id, status: b.status, service_name: b.service_name, client_name: b.client_name, client_email: b.client_email, starts_at: b.starts_at, ends_at: b.ends_at, total_paise: b.total_paise, paid_paise: b.paid_paise });
  if (path === "/v1/vendor/overview") return route.fulfill({ json: { timezone: tz, payments_enabled: false, published: state.profile?.published ?? false, publish_missing: [],
    upcoming: rows.filter(b => ["PENDING", "CONFIRMED"].includes(b.status) && localDate(b.starts_at) >= localDate(MOCK_NOW.toISOString())).map(row),
    money: { collected_30d_paise: rows.reduce((sum, b) => sum + b.paid_paise, 0), balance_due_paise: rows.filter(b => ["PENDING", "CONFIRMED"].includes(b.status)).reduce((sum, b) => sum + b.total_paise - b.paid_paise, 0) },
    todo: rows.filter(b => b.status === "PENDING").map(b => ({ kind: "record_advance", id: b.id, client_name: b.client_name, starts_at: b.starts_at, amount_paise: b.advance_paise })) } });
  if (path === "/v1/vendor/bookings" && method === "GET") {
    const status = url.searchParams.get("status"), q = url.searchParams.get("q")?.toLowerCase();
    return route.fulfill({ json: { timezone: tz, page: 1, has_more: false, bookings: rows.filter(b => (!status || b.status === status) && (!q || `${b.client_name} ${b.client_email}`.toLowerCase().includes(q))).sort((a, b) => b.starts_at.localeCompare(a.starts_at)).map(row) } });
  }
  if (path === "/v1/vendor/bookings" && method === "POST") {
    const service = state.services.find(item => item.id === body.service_id);
    const created: MockBooking = { ...booking(9, body.name, String(service?.name ?? "Service"), "CONFIRMED", new Date(`${body.date}T${body.time}:00+05:30`).toISOString(), 90, Number(service?.price_paise ?? 0), 0, 0), client_email: body.email };
    rows.push(created); return route.fulfill({ status: 201, json: detailFor(created, state) });
  }
  const match = /^\/v1\/vendor\/bookings\/([^/]+)(?:\/(cancel|complete|reschedule))?$/.exec(path);
  if (match) {
    const found = rows.find(b => b.id === match[1]);
    if (!found) return route.fulfill(fail(404, "NOT_FOUND", "Booking not found"));
    if (match[2] === "cancel") { if (!body.reason || String(body.reason).trim().length < 3) return route.fulfill(fail(400, "VALIDATION_ERROR", "Invalid", { fieldErrors: { reason: ["Tell the customer why, in a few words."] } })); found.status = "CANCELLED"; }
    if (match[2] === "complete") found.status = "COMPLETED";
    if (match[2] === "reschedule") { const starts = new Date(`${body.date}T${body.time}:00+05:30`); found.ends_at = new Date(starts.getTime() + 90 * 60_000).toISOString(); found.starts_at = starts.toISOString(); }
    return route.fulfill({ json: detailFor(found, state) });
  }
  if (path === "/v1/vendor/calendar") {
    const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
    return route.fulfill({ json: { timezone: tz, from, to, bookings: rows.filter(b => b.status !== "CANCELLED" && localDate(b.starts_at) >= from && localDate(b.starts_at) <= to).map(row), blocked_periods: state.blocked } });
  }
  if (path === "/v1/vendor/availability/blocked-periods" && method === "POST") { const period = { id: `b-off-${state.blocked.length + 2}`, starts_at: body.starts_at, ends_at: body.ends_at, reason: body.reason ?? "" }; state.blocked.push(period); return route.fulfill({ status: 201, json: period }); }
  if (path.startsWith("/v1/vendor/availability/blocked-periods/") && method === "DELETE") { state.blocked = state.blocked.filter(period => !path.endsWith(period.id)); return route.fulfill({ status: 204 }); }
  if (path === "/v1/vendor/payments") {
    const paid = rows.filter(b => b.paid_paise > 0);
    return route.fulfill({ json: { timezone: tz, payout: { mode: "offline_only" }, summary: { received_paise: paid.reduce((sum, b) => sum + b.paid_paise, 0), online_paise: 0, offline_paise: paid.reduce((sum, b) => sum + b.paid_paise, 0), refunded_paise: 0, owed_by_you_paise: 0, balance_due_paise: rows.filter(b => ["CONFIRMED", "COMPLETED"].includes(b.status)).reduce((sum, b) => sum + b.total_paise - b.paid_paise, 0) },
      payments: paid.map(b => ({ id: `p-${b.id}`, booking_id: b.id, provider: "offline", kind: "advance", status: "captured", amount_paise: b.paid_paise, method: "upi", created_at: "2026-10-20T06:00:00.000Z", verified_at: "2026-10-20T06:00:00.000Z", client_name: b.client_name, service_name: b.service_name })),
      refunds: [], balances_due: rows.filter(b => ["CONFIRMED", "COMPLETED"].includes(b.status) && b.total_paise > b.paid_paise).map(b => ({ id: b.id, client_name: b.client_name, service_name: b.service_name, starts_at: b.starts_at, status: b.status, balance_due_paise: b.total_paise - b.paid_paise })) } });
  }
  if (path === "/v1/vendor/customers") return route.fulfill({ json: { timezone: tz, customers: rows.map(b => ({ email: b.client_email, name: b.client_name, phone: "9820000000", bookings: 1, paid_paise: b.paid_paise, last_starts_at: b.starts_at, history: [{ id: b.id, status: b.status, service_name: b.service_name, starts_at: b.starts_at, total_paise: b.total_paise }] })) } });
  if (path === "/v1/vendor/settings") return route.fulfill({ json: { notify_prefs: { booking_confirmed: true, booking_cancelled: true, reminder_24h: false }, ical_enabled: false, account_email: user.email } });
  if (path === "/v1/vendor/settings/notifications") return route.fulfill({ json: { notify_prefs: body } });
  if (path === "/v1/vendor/settings/ical") return route.fulfill(method === "DELETE" ? { status: 204 } : { status: 201, json: { path: "/v1/ical/mock-token.ics" } });
  return null;
}

/** The admin console API (apps/api/src/admin-routes.ts): verified by default; set state.admin to test the second-factor gate. */
function adminRoute(route: Route, path: string, state: VendorState) {
  const method = route.request().method(); const body = (route.request().postDataJSON() ?? {}) as Record<string, string>;
  if (path === "/v1/admin/2fa") return route.fulfill({ json: { ...state.admin, email: user.email } });
  if (path === "/v1/admin/2fa/enroll") { state.admin.enrolled = true; return route.fulfill({ json: { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauth_url: "otpauth://totp/Bayana%20admin%3Astudio%40example.in?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Bayana" } }); }
  if (path === "/v1/admin/2fa/verify") { if (body.code !== MOCK_CODE) return route.fulfill(fail(400, "OTP_INVALID", "That code is wrong or was already used.")); state.admin.verified = true; return route.fulfill({ json: { verified: true } }); }
  if (!state.admin.verified) return route.fulfill(fail(403, "SECOND_FACTOR_REQUIRED", "Confirm it's you with your authenticator app.", { enrolled: state.admin.enrolled }));
  if (path === "/v1/admin/health") return route.fulfill({ json: { database: "ok", payment_mode: "test", tick_age_minutes: 4, tick_stale: false, last_tick: "2026-11-02T03:56:00.000Z", last_tick_status: "ok", last_reconcile: "2026-11-01T21:30:00.000Z", last_reconcile_status: "ok", failed_jobs_24h: 0, outbox_queued: 2, outbox_oldest: "2026-11-02T03:58:00.000Z", outbox_failed_7d: 1, last_webhook: "2026-11-02T03:40:00.000Z", webhooks_review: 0, webhooks_waiting: 0, holds_overdue: 0 } });
  if (path === "/v1/admin/bookings") return route.fulfill({ json: { bookings: state.bookings.map(b => ({ ...b, vendor_slug: "studio-sunday", hold_expires_at: null, created_at: "2026-10-20T05:00:00.000Z" })) } });
  const stuck = state.bookings[1];
  if (stuck && path === `/v1/admin/bookings/${stuck.id}`) { const fixed = stuck.status === "CONFIRMED"; return route.fulfill({ json: {
    booking: { ...stuck, vendor_slug: "studio-sunday", vendor_name: "Studio Sunday", vendor_email: user.email, timezone: tz, client_phone: "9820000000", hold_expires_at: "2026-11-02T04:10:00.000Z", total_paise: String(stuck.total_paise), advance_paise: String(stuck.advance_paise), created_at: "2026-11-02T03:55:00.000Z", terms_accepted_at: "2026-11-02T03:56:00.000Z" },
    events: [{ from_status: null, to_status: "HELD", actor: "client", reason: "slot held", meta: {}, created_at: "2026-11-02T03:55:00.000Z" }, { from_status: "HELD", to_status: "PENDING", actor: "client", reason: "terms accepted, advance to be paid online", meta: {}, created_at: "2026-11-02T03:56:00.000Z" }, ...(fixed ? [{ from_status: "PENDING", to_status: "CONFIRMED", actor: "razorpay", reason: "advance verified (webhook)", meta: {}, created_at: "2026-11-02T04:00:00.000Z" }] : [])],
    payments: [{ id: "pay-row-1", provider: "razorpay", kind: "advance", status: fixed ? "captured" : "created", amount_paise: 200000, provider_order_id: "order_Mock123", provider_payment_id: fixed ? "pay_Mock123" : null, method: fixed ? "upi" : null, failure_reason: null, created_at: "2026-11-02T03:57:00.000Z", verified_at: fixed ? "2026-11-02T04:00:00.000Z" : null }],
    refunds: [], outbox: [{ id: "mail-1", template: "hold_started", recipient: stuck.client_email, status: "sent", attempts: 0, last_error: null, sent_at: "2026-11-02T03:55:02.000Z", created_at: "2026-11-02T03:55:00.000Z" }], webhooks: [], contract: { sha256: "a".repeat(64), accepted_at: "2026-11-02T03:56:00.000Z", accepted_email: stuck.client_email }, audit: [], payments_enabled: true,
    diagnosis: fixed ? [{ level: "ok", text: "Nothing looks stuck. Status CONFIRMED." }] : [{ level: "info", text: "Order order_Mock123 is open; no captured payment is recorded. If the customer says they paid, re-verify.", action: { kind: "reverify_payment", id: "pay-row-1", label: "Re-verify with Razorpay" } }]
  } }); }
  if (stuck && path === "/v1/admin/payments/pay-row-1/reverify" && method === "POST") { stuck.status = "CONFIRMED"; stuck.paid_paise = 200000; return route.fulfill({ json: { outcome: "confirmed", provider_payments: [{ id: "pay_Mock123", status: "captured", amount: 200000 }] } }); }
  if (path === "/v1/admin/jobs/tick" || path === "/v1/admin/jobs/nightly") return route.fulfill({ json: { ok: true, results: [{ job: "expire_holds", status: "ok" }, { job: "send_outbox", status: "ok" }] } });
  const lists: Record<string, string> = { "/v1/admin/users": "users", "/v1/admin/vendors": "vendors", "/v1/admin/payments": "payments", "/v1/admin/webhooks": "webhooks", "/v1/admin/outbox": "emails", "/v1/admin/job-runs": "runs", "/v1/admin/audit": "entries" };
  if (lists[path]) return route.fulfill({ json: { [lists[path]]: [] } });
  return route.fulfill(fail(404, "NOT_FOUND", "Not found"));
}

export const MOCK_PASSWORD = "correct-horse-battery-9", MOCK_CODE = "123456";
const user = { id: "u1", email: "studio@example.in", role: "VENDOR" };
let passwordSet = false;
/** Mirrors the real auth API's contract: uniform 202 for code requests, INVALID_CREDENTIALS / OTP_INVALID for bad input. */
function authRoute(route: Route, path: string) {
  const body = (route.request().postDataJSON() ?? {}) as Record<string, string>;
  if (path === "/v1/auth/otp/request") return route.fulfill({ status: 202, json: { ok: true } });
  if (path === "/v1/auth/providers") return route.fulfill({ json: { google: true } });
  if (path === "/v1/auth/methods") return route.fulfill({ json: { email_code: true, password: { set: passwordSet }, google: { available: true, connected: true, email: "studio@gmail.com" } } });
  if (path === "/v1/auth/password" && route.request().method() === "PUT") { passwordSet = true; return route.fulfill({ json: { password: { set: true } } }); }
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
    timeline: [{ to_status: "HELD", created_at: `${isoDay(0)}T05:00:00.000Z` }, { to_status: "PENDING", created_at: `${isoDay(0)}T05:04:00.000Z` }], payments: [], refunds: [], can_pay: false,
    contract: { body: ["Booking", "Business: Studio Sunday", "Service: Portrait session", "", "Booking terms", "Advance confirms your date."].join("\n"), sha256: "a".repeat(64), accepted_at: `${isoDay(0)}T05:04:00.000Z` }, contract_preview: null,
    cancellation_tiers: [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }], can_cancel: true, refund_preview: { refund_paise: 0, refund_percent: 100, paid_paise: 0 }
  } });
  if (path.startsWith("/v1/bookings/")) return route.fulfill(fail(404, "NOT_FOUND", "Not found"));
  return route.fulfill(fail(401, "AUTHENTICATION_REQUIRED", "Sign in is required"));
}

/** Answers vendor and auth calls from in-memory state; everything else is a 401 in the API's error shape. */
export async function mockApi(page: Page, state: VendorState = establishedVendor()) {
  passwordSet = false;
  await page.route(`${MOCK_API_URL}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/v1/vendor/")) return vendorRoute(route, path, state);
    if (path.startsWith("/v1/admin/")) return adminRoute(route, path, state);
    if (path.startsWith("/v1/auth/")) return authRoute(route, path);
    if (path.startsWith("/v1/vendors/") || path.startsWith("/v1/bookings/")) return publicRoute(route, path);
    return route.fulfill(fail(401, "AUTHENTICATION_REQUIRED", "Sign in is required"));
  });
  return state;
}
