import type { MetadataRoute } from "next";
import { siteUrl } from "@bayana/shared";
import { env } from "@/env";
import { loadServerEnv } from "@/env-schema";
import { indexingAllowed } from "@/lib/site";

/** Private areas never indexed: accounts, admin, booking pages (they carry access tokens), sign-in and internal pages. */
export const privatePaths = ["/dashboard", "/admin", "/onboarding", "/my-bookings", "/b/", "/login", "/signup", "/forgot", "/auth", "/waking", "/design"];

/**
 * Indexable (marketing, legal and vendor pages) only with APP_ENV=production AND LEGAL_REVIEWED=true; staging, local builds
 * and production before the legal review ask every crawler to stay out.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed(loadServerEnv())) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: privatePaths }, sitemap: siteUrl(env.NEXT_PUBLIC_SITE_URL, "/sitemap.xml"), host: siteUrl(env.NEXT_PUBLIC_SITE_URL) };
}
