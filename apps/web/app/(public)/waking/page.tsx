import type { Metadata } from "next";
import { Suspense } from "react";
import { WakingStatus } from "./waking-status";

// Rendered per request so Next can put the CSP nonce on its scripts (lib/csp.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "One moment | Bayana", robots: { index: false } };
/** Shown while the API wakes from a cold start (SPEC 16.6): polls /health every 3 seconds, then returns the visitor. */
export default function Waking() {
  return <Suspense><WakingStatus /></Suspense>;
}
