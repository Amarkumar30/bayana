import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Public booking layout: minimal chrome so the vendor, not Bayana, is the focus. The page itself shows the vendor name, and
 * says once where it matters that nothing is held before the email is confirmed. The footer is the slim one: every link in
 * one wrapping row and who operates Bayana, instead of the three-column site footer.
 * Links here do not prefetch: on a phone the cached vendor page should paint before any other route is fetched.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <SiteFooter slim />
    </div>
  );
}
