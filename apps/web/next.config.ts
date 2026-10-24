import type { NextConfig } from "next";
import { loadWebEnv } from "./env-schema";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
let apiOrigin = "";
try { apiOrigin = new URL(loadWebEnv().NEXT_PUBLIC_API_URL).origin; } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const dev = process.env.NODE_ENV !== "production";

// Baseline Content Security Policy. Beyond our own origin and the API, the only third party is Razorpay Checkout
// (script from checkout.razorpay.com; its frames, API calls and images on *.razorpay.com). 'unsafe-inline' scripts remain
// for Next's inline bootstrap until nonces arrive with the hardening phase; dev adds eval and the HMR socket.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://*.razorpay.com${dev ? " ws: wss:" : ""}`,
  "frame-src https://*.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

// The dev indicator floats over page content and would leak into screenshot baselines.
// next dev keeps only 5 compiled pages by default; with ~25 routes under parallel tests it keeps disposing and
// recompiling them, and each recompile hot-swaps CSS under open pages. Dev-only; ignored by next build/start.
const nextConfig: NextConfig = {
  reactStrictMode: true, devIndicators: false, onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  async headers() { return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }]; }
};
export default nextConfig;
