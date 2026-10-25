// Used by next.config.ts. No imports, so `node --test` can load it directly (next-config.test.mjs).
// These headers are the same on every response (SPEC 12.5); the Content-Security-Policy is set per request by middleware.ts
// (lib/csp.ts), so pages with account data get a nonce. HSTS only when the site URL is HTTPS (staging, production), and without
// "preload": joining the browser preload list is hard to undo, so add it only after production has run cleanly for months.
export function securityHeaders(production: boolean, siteUrl: string | undefined) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    // Razorpay Checkout may open a UPI or bank window and needs to talk back to it.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")' },
    ...(production && siteUrl?.startsWith("https:") ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : [])
  ];
}
