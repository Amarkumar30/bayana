import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

// Rendered per request so Next can put the CSP nonce on its scripts (lib/csp.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin | Bayana", robots: { index: false, follow: false, nocache: true } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
