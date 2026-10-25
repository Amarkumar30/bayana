import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

// Rendered per request so Next can put the CSP nonce on its scripts (lib/csp.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <DashboardShell>{children}</DashboardShell>; }
