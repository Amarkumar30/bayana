import type { Metadata } from "next";
import { BookingsView } from "./bookings-view";

export const metadata: Metadata = { title: "Bookings | Bayana", robots: { index: false, follow: false } };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <BookingsView initial={{ q: one(params.q), status: one(params.status), from: one(params.from), to: one(params.to) }} />;
}
