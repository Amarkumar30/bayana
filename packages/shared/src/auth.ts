// Sign-in helpers shared by the API (Google callback) and the web (buttons and messages).

/** Where Google sign-in may return to: app sections only, as a plain relative path (no scheme, host, "//", "..", query or hash). */
const NEXT_PATH = /^\/(dashboard|onboarding|admin)(\/[A-Za-z0-9_-]+)*\/?$/;
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
  google_session_changed: "You were signed out while connecting Google. Sign in and try again."
};

/**
 * Versions of the published policies a person agrees to (PV-01). Bump a version when the text of that page changes; each
 * consent row records the version that was in force.
 */
export const POLICY_VERSIONS = { account_terms: "2026-10-26-draft", privacy_policy: "2026-10-26-draft", booking_terms: "2026-10-25-draft", refund_policy: "2026-10-26-draft", vendor_terms: "2026-10-26-draft" } as const;
