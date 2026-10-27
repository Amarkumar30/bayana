// Every public URL the web app shows or links to comes from NEXT_PUBLIC_SITE_URL (validated in env-schema.ts), never from a
// hard-coded host, so the same build serves staging, a local run or https://bayana.in by configuration alone. No imports, so
// node --test loads it directly (site.test.mjs) and next.config.ts can use it.

const trimmed = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

/** The vendor's public page: `${SITE_URL}/<slug>`. */
export const vendorUrl = (siteUrl: string, slug: string) => `${trimmed(siteUrl)}/${encodeURIComponent(slug)}`;

/** The site's host as people type it ("bayana.in", "staging.bayana.in", "localhost:3000"). */
export const siteHost = (siteUrl: string) => new URL(siteUrl).host;

/** The vendor link as shown in text: "bayana.in/studio-sunday". */
export const vendorLinkLabel = (siteUrl: string, slug: string) => `${siteHost(siteUrl)}/${slug}`;

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

/** APP_ENV=production: the site and API must be public https origins. Names only in the result, never values. */
export function productionWebProblems(env: { APP_ENV?: string; NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_API_URL?: string }) {
  if (env.APP_ENV !== "production") return [];
  const problems: string[] = [];
  for (const name of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_API_URL"] as const) {
    const value = env[name];
    let ok = false;
    try { const url = new URL(value ?? ""); ok = url.protocol === "https:" && !isLocalHost(url.hostname); } catch { ok = false; }
    if (!ok) problems.push(`${name}: must be a public https origin when APP_ENV=production (not http, not localhost)`);
  }
  return problems;
}
