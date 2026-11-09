// Indexing, the www redirect and the build guard for the public site URL. Every URL itself is built by @bayana/shared's
// site.ts from NEXT_PUBLIC_SITE_URL (validated in env-schema.ts). next.config.ts uses this file, and its config loader resolves
// only CommonJS, so the shared rule is imported from its source file (which has no imports), not from the ESM package.
import { deployedSiteUrlProblem } from "../../../packages/shared/src/site.ts";

/**
 * Search engines may index the site only in production AND after a lawyer has reviewed the legal pages. Everything else
 * (staging, local, production before the review) is noindex: robots.txt disallows all, pages carry noindex metadata and
 * every response an X-Robots-Tag header.
 */
export const indexingAllowed = (env: { APP_ENV?: string; LEGAL_REVIEWED?: string }) => env.APP_ENV === "production" && env.LEGAL_REVIEWED === "true";

export const NOINDEX_HEADER = { key: "X-Robots-Tag", value: "noindex, nofollow" } as const;

const isLocalHost = (hostname: string) => hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

/**
 * www.<host> answers with a permanent redirect to the site origin, keeping the path and query, when the site lives on a bare
 * domain such as https://bayana.in. Nothing for a www site, a subdomain like staging.bayana.in, or a local host.
 */
export function wwwRedirects(siteUrl: string | undefined) {
  if (!siteUrl) return [];
  const url = new URL(siteUrl);
  if (isLocalHost(url.hostname) || url.hostname.startsWith("www.") || url.hostname.split(".").length !== 2) return [];
  return [{ source: "/:path*", has: [{ type: "host" as const, value: `www.${url.hostname}` }], destination: `${url.origin}/:path*`, permanent: true }];
}

/**
 * The build guard. APP_ENV staging or production (a deployment): NEXT_PUBLIC_SITE_URL must be the live site, never a staging
 * or preview host. APP_ENV=production: the API must also be a public https origin. Names only in the result, never values.
 */
export function deployedWebProblems(env: { APP_ENV?: string; NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_API_URL?: string }) {
  const site = deployedSiteUrlProblem(env.APP_ENV, env.NEXT_PUBLIC_SITE_URL);
  const problems: string[] = site ? [`NEXT_PUBLIC_SITE_URL: ${site}`] : [];
  if (env.APP_ENV !== "production") return problems;
  for (const name of site ? ["NEXT_PUBLIC_API_URL"] as const : ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_API_URL"] as const) {
    const value = env[name];
    let ok = false;
    try { const url = new URL(value ?? ""); ok = url.protocol === "https:" && !isLocalHost(url.hostname); } catch { ok = false; }
    if (!ok) problems.push(`${name}: must be a public https origin when APP_ENV=production (not http, not localhost)`);
  }
  return problems;
}
