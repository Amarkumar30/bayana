import { Lock } from "lucide-react";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Public booking layout: minimal chrome so the vendor, not Bayana, is the focus. The page itself shows the vendor name.
 * Links here do not prefetch: on a phone the cached vendor page should paint before any other route is fetched.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <p className="mx-auto flex w-full max-w-3xl items-start gap-2 px-4 text-xs text-muted sm:px-6"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Your email is verified before anything is held. Payments, when enabled, are handled by Razorpay. Bayana never sees card details.</p>
      <SiteFooter narrow />
    </div>
  );
}
