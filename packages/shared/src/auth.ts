// Sign-in helpers shared by the API (Google callback) and the web (buttons and messages).
import { slugProblem } from "./slug.js";

/**
 * Where Google sign-in may return to: app sections, or the person's own bookings, as a plain relative path (no scheme, host,
 * "//", "..", query or hash).
 */
const NEXT_PATH = /^(\/(dashboard|onboarding|admin)(\/[A-Za-z0-9_-]+)*\/?|\/my-bookings)$/;
/** A customer's own bookings list: where "My bookings" sign-ins come back to. */
export const MY_BOOKINGS_PATH = "/my-bookings";
export const googleNextPath = (value: unknown) => typeof value === "string" && value.length <= 200 && NEXT_PATH.test(value) ? value : null;

/** The ?error= codes the Google callback redirects with, as sentences that say what to do next. */
export const googleErrorCopy: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled. Try again, or sign in with an email code.",
  google_expired: "That Google sign-in took too long or was already used. Please try again.",
  google_failed: "We couldn't sign you in with Google. Please try again, or sign in with an email code.",
  google_unverified: "Google hasn't verified that email address yet. Sign in with an email code instead.",
  google_other_account: "This Bayana account is already connected to a different Google account. Use that one, or an email code.",
  google_in_use: "That Google account is already connected to another Bayana account.",
  google_unavailable: "Google sign-in isn't available right now. Sign in with an email code.",
  google_session_changed: "You were signed out while connecting Google. Sign in and try again.",
  google_business_account: "This Google account belongs to a business account on Bayana. Use another Google account, or confirm your email with a code.",
  google_customer_failed: "We couldn't use Google just now. Please confirm your email with a code."
};

/**
 * Who a Google sign-in is for. vendor (the default, so existing links keep working): sign in or create a business account.
 * customer: confirm the email for a booking; the person never becomes a vendor and returns to the booking they started.
 */
export const GOOGLE_INTENTS = ["vendor", "customer"] as const;
export type GoogleIntent = typeof GOOGLE_INTENTS[number];
export const googleIntent = (value: unknown): GoogleIntent | null => value === undefined || value === "" ? "vendor" : (GOOGLE_INTENTS as readonly unknown[]).includes(value) ? value as GoogleIntent : null;

/** What a customer had chosen before leaving for Google; it travels in the return path and is checked again on return. */
export type BookingSelection = { slug: string; service: string; date?: string; start?: string; blocks?: number; days?: number };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/, START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
/**
 * The longest return path accepted. The largest real one (a 40-character slug, service, date, start, sessions) is about
 * 140 characters; the margin keeps a cap without ever rejecting a real selection.
 */
export const RETURN_PATH_MAX = 300;
const count = (value: string | null, max: number) => value !== null && /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : undefined;

/**
 * The booking page path a customer returns to after Google: /<slug>/book?service=<uuid>[&date][&start][&blocks][&days]&google=1.
 * Built from validated parts in a fixed order, so it never carries anything else.
 */
export function bookingReturnPath(selection: BookingSelection) {
  const params = new URLSearchParams({ service: selection.service });
  if (selection.date) params.set("date", selection.date);
  if (selection.start) params.set("start", selection.start);
  if (selection.blocks) params.set("blocks", String(selection.blocks));
  if (selection.days) params.set("days", String(selection.days));
  params.set("google", "1");
  return `/${selection.slug}/book?${params}`;
}

/**
 * Parses and re-validates a customer return path (a relative /<slug>/book path with only the known parameters, each well
 * formed). Anything else, including another host, "//", "..", a hash or an unknown parameter, is refused (null).
 */
export function parseBookingReturnPath(value: unknown): BookingSelection | null {
  // A plain path: no other host, no "//" or backslash, no hash, no "@", no control characters (the URL parser would silently
  // drop tabs and newlines), and no dot or escape in the path part (no ".." or encoded "/" segments).
  if (typeof value !== "string" || value.length > RETURN_PATH_MAX || !value.startsWith("/") || value.startsWith("//") || /[\\#@\u0000-\u001f\u007f]/.test(value) || /[.%]/.test(value.split("?")[0])) return null;
  let url: URL;
  try { url = new URL(value, "https://return.invalid"); } catch { return null; }
  if (url.origin !== "https://return.invalid") return null;
  const match = /^\/([^/]+)\/book$/.exec(url.pathname);
  // A real vendor slug: the same rule as signup, so reserved words such as dashboard or admin never pass.
  if (!match || !SLUG.test(match[1]) || slugProblem(match[1])) return null;
  const allowed = new Set(["service", "date", "start", "blocks", "days", "google"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length > 1) return null;
  const service = url.searchParams.get("service"), date = url.searchParams.get("date"), start = url.searchParams.get("start");
  const blocks = url.searchParams.get("blocks"), days = url.searchParams.get("days"), google = url.searchParams.get("google");
  if (!service || !UUID.test(service) || (google !== null && google !== "1")) return null;
  if (date !== null && !DATE.test(date) || start !== null && !START.test(start)) return null;
  const selection: BookingSelection = { slug: match[1], service, ...(date ? { date } : {}), ...(start ? { start } : {}) };
  if (blocks !== null) { const value = count(blocks, 12); if (!value) return null; selection.blocks = value; }
  if (days !== null) { const value = count(days, 30); if (!value) return null; selection.days = value; }
  return selection;
}

/** A valid customer return path: My bookings, or a booking page normalised (rebuilt from its validated parts); else null. */
export const googleCustomerNextPath = (value: unknown) => { if (value === MY_BOOKINGS_PATH) return MY_BOOKINGS_PATH; const selection = parseBookingReturnPath(value); return selection ? bookingReturnPath(selection) : null; };

/**
 * The one rule for where a Google sign-in may return, used by the web (building the start link) and the API (checking it):
 * vendor, an app section; customer, a booking page. Returns the normalised path, or null when it is not allowed.
 */
export const isAllowedReturnPath = (intent: GoogleIntent, value: unknown) => intent === "customer" ? googleCustomerNextPath(value) : googleNextPath(value);

/**
 * Where a person lands after signing in, by role, whatever button they used. A customer-only account goes to My bookings (or
 * the booking it came from); a vendor to the requested app section (default /dashboard), or onboarding while it has no
 * business profile. Nobody's role is changed by this.
 */
export function landingPath(role: string, next: string | null, hasVendorProfile: boolean) {
  if (role !== "VENDOR" && role !== "ADMIN") return next && googleCustomerNextPath(next) ? next : MY_BOOKINGS_PATH;
  const wanted = next && googleNextPath(next) ? next : "/dashboard";
  if (role === "VENDOR" && !hasVendorProfile && !wanted.startsWith("/admin") && wanted !== MY_BOOKINGS_PATH) return "/onboarding";
  return wanted;
}

/**
 * Where to send a customer back when the return path itself was refused: their vendor's booking page if the first segment is
 * a valid vendor slug (nothing else from the path is kept), else null (the caller uses the site home).
 */
export function bookingSlugFrom(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const slug = /^\/([a-z0-9-]{1,60})(?:[/?]|$)/.exec(value)?.[1];
  return slug && SLUG.test(slug) && !slugProblem(slug) ? slug : null;
}

/**
 * Versions of the published policies a person agrees to (PV-01). Bump a version when the text of that page changes; each
 * consent row records the version that was in force.
 */
export const POLICY_VERSIONS = { account_terms: "2026-10-26-draft", privacy_policy: "2026-10-26-draft", booking_terms: "2026-10-25-draft", refund_policy: "2026-10-26-draft", vendor_terms: "2026-10-26-draft" } as const;
