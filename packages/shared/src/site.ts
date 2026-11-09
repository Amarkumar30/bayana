// The public site's URL: every absolute link a person follows (share card, copy link, WhatsApp, QR code, emails, Google's
// return, canonical and Open Graph URLs, sitemap, robots) is built here from one configured origin. The web passes
// NEXT_PUBLIC_SITE_URL, the API passes SITE_URL; nothing else may assemble a site URL.

/** The only site URL a deployed environment (APP_ENV staging or production) may use: there is one live site. */
export const DEPLOYED_SITE_URL = "https://bayana.in";
export const DEPLOYED_APP_ENVS: readonly string[] = ["staging", "production"];

const origin = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

/** `${site}${path}`; path is "" (the site itself) or starts with "/". */
export const siteUrl = (site: string, path = "") => `${origin(site)}${path}`;
/** The site's host as people type it ("bayana.in", "localhost:3000"). */
export const siteHost = (site: string) => new URL(site).host;
/** A vendor's public page: `${site}/<slug>`. */
export const vendorPageUrl = (site: string, slug: string) => siteUrl(site, `/${encodeURIComponent(slug)}`);
/** A private booking page, with its access token when the link is for the customer. */
export const bookingPageUrl = (site: string, bookingId: string, token?: string) => siteUrl(site, `/b/${bookingId}${token ? `?t=${encodeURIComponent(token)}` : ""}`);

/** Everything the share card hands out (copy link, WhatsApp, QR code) comes from this one call, so they can never disagree. */
export function vendorShareLinks(site: string, slug: string) {
  const url = vendorPageUrl(site, slug);
  return { url, label: `${siteHost(site)}/${slug}`, qrTarget: url, whatsapp: (businessName: string) => `https://wa.me/?text=${encodeURIComponent(`Book ${businessName} here: ${url}`)}` };
}

/**
 * A deployed environment must link to the live site and nothing else: a staging or preview origin copied into production
 * config would send customers there. Returns the rule broken (never the rejected value), or null; the caller names its variable.
 */
export function deployedSiteUrlProblem(appEnv: string | undefined, value: string | undefined): string | null {
  if (!appEnv || !DEPLOYED_APP_ENVS.includes(appEnv)) return null;
  if (!value) return `is required when APP_ENV=${appEnv}; set it to ${DEPLOYED_SITE_URL}`;
  if (origin(value) !== DEPLOYED_SITE_URL || value.includes("staging")) return `must be ${DEPLOYED_SITE_URL} when APP_ENV=${appEnv} (no staging or preview host)`;
  return null;
}
