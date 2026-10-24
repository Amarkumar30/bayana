import Link from "next/link";
import { Lock } from "lucide-react";
import { Brand } from "@/components/layout/brand";

/** Public booking layout: minimal chrome so the vendor, not Bayana, is the focus. The page itself shows the vendor name. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="inline-flex items-start gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Your email is verified before anything is held. Payments, when enabled, are handled by Razorpay. Bayana never sees card details.</p>
          <p className="flex shrink-0 items-center gap-3"><span>Booked with</span><Brand compact /><Link href="/terms" className="text-muted">Terms</Link><Link href="/privacy" className="text-muted">Privacy</Link></p>
        </div>
      </footer>
    </div>
  );
}
