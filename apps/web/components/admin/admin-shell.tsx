"use client";
import { Activity, BriefcaseBusiness, CreditCard, Gauge, ListChecks, Mail, ScrollText, Users, Webhook } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, type ShellItem } from "@/components/layout/dashboard-shell";
import { AdminGate } from "./admin-data";

const items: ShellItem[] = [
  { href: "/admin", label: "Health", icon: Gauge },
  { href: "/admin/bookings", label: "Bookings", icon: ListChecks },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/admin/outbox", label: "Emails", icon: Mail },
  { href: "/admin/jobs", label: "Job runs", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/vendors", label: "Vendors", icon: BriefcaseBusiness },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText }
];

/** SPEC 5.4: the admin console, behind is_admin plus a TOTP check on this session (AU-10). */
export function AdminShell({ children }: { children: ReactNode }) {
  return <AppShell items={items} mobilePrimary={["/admin", "/admin/bookings", "/admin/payments", "/admin/outbox"]} label="Admin" footer={<><p className="font-medium">Admin console</p><p className="text-muted">Every view and action here is recorded in the audit log.</p></>}><AdminGate>{children}</AdminGate></AppShell>;
}
