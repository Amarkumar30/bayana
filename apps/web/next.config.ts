import type { NextConfig } from "next";
import { loadServerEnv, loadWebEnv } from "./env-schema";
import { assertBusinessDetailsReady } from "./lib/business-details";
import { securityHeaders as createSecurityHeaders } from "./security-headers";
import { NOINDEX_HEADER, indexingAllowed, productionWebProblems, wwwRedirects } from "./lib/site";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid, and refuse a
// production build (NODE_ENV=production with APP_ENV=production) while lib/business-details.ts still has placeholders.
// APP_ENV=production also requires public https origins for the site and the API (lib/site.ts productionWebProblems).
try {
  loadWebEnv();
  const problems = productionWebProblems({ APP_ENV: loadServerEnv().APP_ENV, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
  if (problems.length) throw new Error(["Invalid web environment for APP_ENV=production:", ...problems.map(problem => `  - ${problem}`)].join("\n"));
  assertBusinessDetailsReady({ nodeEnv: process.env.NODE_ENV, appEnv: loadServerEnv().APP_ENV });
} catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const securityHeaders = createSecurityHeaders(process.env.NODE_ENV === "production", process.env.NEXT_PUBLIC_SITE_URL);
// Not indexable unless APP_ENV=production and LEGAL_REVIEWED=true: every response also says so in a header.
const robotsHeaders = indexingAllowed(loadServerEnv()) ? [] : [NOINDEX_HEADER];

// The dev indicator floats over page content and would leak into screenshot baselines.
// next dev keeps only 5 compiled pages by default; with ~25 routes under parallel tests it keeps disposing and
// recompiling them, and each recompile hot-swaps CSS under open pages. Dev-only; ignored by next build/start.
const nextConfig: NextConfig = {
  // The stylesheet (~10 KB) goes inside the HTML: on a slow phone connection the first paint no longer waits for a
  // separate render-blocking request (public page LCP, SPEC 18). Production builds only; the CSP allows inline styles.
  experimental: { inlineCss: true },
  reactStrictMode: true, devIndicators: false, onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: [...securityHeaders, ...robotsHeaders] }]; },
  // www.bayana.in -> https://bayana.in, permanently, path and query kept (nothing for staging or local hosts).
  async redirects() { return wwwRedirects(process.env.NEXT_PUBLIC_SITE_URL); }
};
export default nextConfig;
