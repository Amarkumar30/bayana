import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState, Skeleton } from "@/components/ui/display";
import { BookingFlow } from "./booking-flow";

// Rendered per request so Next can put the CSP nonce on its scripts (lib/csp.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a time | Bayana", robots: { index: false } };

export default function Book() {
  return <Suspense fallback={<LoadingState label="Loading booking details…" className="grid gap-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-7" /><Skeleton className="h-72 rounded-card" /></LoadingState>}><BookingFlow /></Suspense>;
}
