import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: "Admin | Bayana", robots: { index: false, follow: false, nocache: true } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
