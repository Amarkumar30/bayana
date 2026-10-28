import type { MetadataRoute } from "next";
import { env } from "@/env";
import { footerLinks } from "@/components/layout/site-footer";

/** Public marketing and legal pages. Vendor pages (/<slug>) live in the API and are found through links, not listed here. */
export const sitemapPaths = ["/", ...[...footerLinks.product, ...footerLinks.legal].map(link => link.href).filter(href => !href.startsWith("/login"))];

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths.map(path => ({ url: `${env.NEXT_PUBLIC_SITE_URL}${path === "/" ? "" : path}`, changeFrequency: "monthly", priority: path === "/" ? 1 : 0.5 }));
}
