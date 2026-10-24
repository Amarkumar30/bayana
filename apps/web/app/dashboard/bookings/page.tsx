import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState, sampleBookings } from "@/components/preview/sample";
import { EmptyState, LoadingState, Money, Skeleton, StatusBadge, Table, Td, Th } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/field";
import { BookingDetailSheet } from "./booking-detail-sheet";

export const metadata = previewMetadata("Bookings");
export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  return (
    <>
      <PreviewBanner />
      <PageHeader eyebrow="Bookings" title="All bookings" description="Search, filter and open any booking to see its timeline and payments." />
      <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem]" role="search" aria-label="Filter bookings">
        <Field label="Search">{p => <Input {...p} type="search" placeholder="Customer name or email" />}</Field>
        <Field label="Status">{p => <Select {...p} defaultValue="all"><option value="all">All statuses</option><option>Held</option><option>Pending</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option><option>Expired</option></Select>}</Field>
      </form>
      {state === "loading" ? <LoadingState label="Loading bookings…" className="grid gap-2">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-14" />)}</LoadingState>
        : state === "empty" ? <EmptyState icon={<ListChecks />} title="No bookings yet" description="Share your page link on WhatsApp or Instagram. New bookings appear here the moment a client reserves a time." />
        : <>
          <ul className="grid gap-3 md:hidden">{sampleBookings.map(booking => (
            <li key={booking.id} className="grid gap-2 rounded-card bg-surface p-4 shadow-soft ring-1 ring-border/70">
              <div className="flex items-start justify-between gap-3"><div className="grid"><strong>{booking.customer}</strong><span className="text-sm text-muted">{booking.service}</span></div><StatusBadge status={booking.status} /></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted">{booking.date} · {booking.time}</span><BookingDetailSheet booking={booking} /></div>
            </li>
          ))}</ul>
          <div className="hidden md:block"><Table><thead><tr><Th>Customer</Th><Th>Service</Th><Th>When</Th><Th>Status</Th><Th className="text-right">Total</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>{sampleBookings.map(booking => (
            <tr key={booking.id}><Td className="font-medium">{booking.customer}</Td><Td className="text-muted">{booking.service}</Td><Td className="whitespace-nowrap tabular-nums">{booking.date} · {booking.time}</Td><Td><StatusBadge status={booking.status} /></Td><Td className="text-right"><Money paise={booking.total} size="sm" /></Td><Td className="text-right"><BookingDetailSheet booking={booking} /></Td></tr>
          ))}</tbody></Table></div>
        </>}
    </>
  );
}
