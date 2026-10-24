import type { Metadata } from "next";
import { AvailabilityManager } from "./availability-manager";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return <>{children}<AvailabilityManager /></>; }
