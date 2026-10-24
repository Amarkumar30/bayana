import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingPage, BookingSkeleton } from "./booking-page";

// Private: reached only through the emailed link (token) or by the signed-in customer or vendor. Never indexed.
export const metadata: Metadata = { title: "Your booking | Bayana", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function CustomerBooking() {
  return <Suspense fallback={<BookingSkeleton />}><BookingPage /></Suspense>;
}
