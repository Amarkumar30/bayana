import { SiteFooter, SiteHeader } from "@/components/layout/site-chrome";

/** Marketing layout: header, page, footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main><SiteFooter /></>;
}
