import type { NextConfig } from "next";
import { loadServerEnv, loadWebEnv } from "./env-schema";
import { securityHeaders as createSecurityHeaders } from "./security-headers";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
try { loadWebEnv(); loadServerEnv(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const securityHeaders = createSecurityHeaders(process.env.NODE_ENV === "production", process.env.NEXT_PUBLIC_SITE_URL);

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
