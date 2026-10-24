import type { Metadata } from "next";
import { Suspense } from "react";
import { WakingStatus } from "./waking-status";

export const metadata: Metadata = { title: "One moment | Bayana", robots: { index: false } };
/** Shown while the API wakes from a cold start (SPEC 16.6): polls /health every 3 seconds, then returns the visitor. */
export default function Waking() {
  return <Suspense><WakingStatus /></Suspense>;
}
