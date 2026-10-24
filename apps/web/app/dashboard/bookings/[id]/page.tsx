import type { Metadata } from "next";
import { BookingDetailView } from "./booking-detail";

export const metadata: Metadata = { title: "Booking | Bayana", robots: { index: false, follow: false } };
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingDetailView id={id} />;
}
