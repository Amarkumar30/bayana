import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { SiteFooter } from "@/components/layout/site-footer";

// Rendered per request so Next can put the CSP nonce on its scripts (lib/csp.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Auth layout: one centred card, nothing else competing for attention. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--primary-soft),transparent)]">
      <header className="flex h-16 items-center px-4 sm:px-6"><Brand /></header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-raised ring-1 ring-border/70 sm:p-8">{children}</div>
      </main>
      <p className="flex items-center justify-center gap-1 px-4 pb-2 text-xs text-muted"><ShieldCheck className="size-3.5" aria-hidden />Codes and passwords are never shared with vendors</p>
      <SiteFooter narrow />
    </div>
  );
}
