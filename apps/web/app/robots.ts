import type { MetadataRoute } from "next";
import { env } from "@/env";
import { loadServerEnv } from "@/env-schema";

/** Private areas never indexed: accounts, admin, booking pages (they carry access tokens), sign-in and internal pages. */
export const privatePaths = ["/dashboard", "/admin", "/onboarding", "/my-bookings", "/b/", "/login", "/signup", "/forgot", "/auth", "/waking", "/design"];

/** Production only is indexable (marketing, legal and vendor pages); staging and local builds ask every crawler to stay out. */
export default function robots(): MetadataRoute.Robots {
  if (loadServerEnv().APP_ENV !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: privatePaths }, sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`, host: env.NEXT_PUBLIC_SITE_URL };
}
