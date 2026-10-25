import type { NextConfig } from "next";
import { loadWebEnv } from "./env-schema";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
try { loadWebEnv(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const dev = process.env.NODE_ENV !== "production";

// The Content-Security-Policy is set per request by middleware.ts (lib/csp.ts), so pages with account data get a nonce.
// These headers are the same on every response (SPEC 12.5). HSTS only when the site URL is HTTPS (staging, production).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Razorpay Checkout may open a UPI or bank window and needs to talk back to it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")' },
  ...(!dev && process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https:") ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : [])
];

// The dev indicator floats over page content and would leak into screenshot baselines.
// next dev keeps only 5 compiled pages by default; with ~25 routes under parallel tests it keeps disposing and
// recompiling them, and each recompile hot-swaps CSS under open pages. Dev-only; ignored by next build/start.
const nextConfig: NextConfig = {
  // The stylesheet (~10 KB) goes inside the HTML: on a slow phone connection the first paint no longer waits for a
  // separate render-blocking request (public page LCP, SPEC 18). Production builds only; the CSP allows inline styles.
  experimental: { inlineCss: true },
  reactStrictMode: true, devIndicators: false, onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; }
};
export default nextConfig;
