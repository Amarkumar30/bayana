// Content Security Policy (SPEC 12.5). Third parties: Razorpay Checkout (script, frames, API, images) and, only when
// NEXT_PUBLIC_SENTRY_DSN is set, Sentry's ingest host for error reports. Nothing else.

/** Pages that handle accounts or personal data render per request and get a nonce-based script policy. */
const STRICT = /^\/(login|signup|forgot|auth|onboarding|dashboard|admin|b|my-bookings|waking)(\/|$)|^\/[^/]+\/book(\/|$)/;
export const usesNonce = (pathname: string) => STRICT.test(pathname);

export const sentryOrigin = (dsn: string | undefined) => { try { return dsn ? new URL(dsn).origin : null; } catch { return null; } };

/**
 * With a nonce: only scripts carrying it (Next's own, which load the rest; 'strict-dynamic' extends trust to scripts they
 * add, such as Razorpay Checkout). Without one (static marketing pages and the cached public vendor page, which hold no
 * account data): inline scripts are allowed because cached HTML cannot carry a per-request nonce; sources stay restricted.
 */
export function contentSecurityPolicy(options: { nonce: string | null; apiOrigin: string; dev: boolean; sentry: string | null }) {
  const { nonce, apiOrigin, dev, sentry } = options;
  const scripts = nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts}${dev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
    // React and Radix set style attributes at runtime, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.razorpay.com",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} https://*.razorpay.com${sentry ? ` ${sentry}` : ""}${dev ? " ws: wss:" : ""}`,
    "frame-src https://*.razorpay.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Google sign-in is a top-level navigation to the API, never a form post.
    `form-action 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    // Only when the API itself is HTTPS (staging, production); a local production build talks to http://localhost.
    ...(!dev && apiOrigin.startsWith("https:") ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}
