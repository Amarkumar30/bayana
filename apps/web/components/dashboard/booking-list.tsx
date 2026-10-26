import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatBookingTime, formatDate, formatTime } from "@/components/booking/time";
import { Money, StatusBadge, Table, Td, Th } from "@/components/ui/display";
import type { BookingRow } from "./types";

// Daily bookings show their dates; hourly ones the date and the time (the whole range for several sessions).
const when = (row: BookingRow, timezone: string) => row.booking_mode === "daily" ? formatBookingTime(row, timezone) : `${formatDate(row.starts_at, timezone, "short")} · ${formatBookingTime(row, timezone)}`;
export const bookingHref = (id: string) => `/dashboard/bookings/${id}`;

/** Cards below the md breakpoint, a table from md up (SPEC 5.3: tables become cards on mobile). */
export function BookingList({ rows, timezone, caption }: { rows: BookingRow[]; timezone: string; caption: string }) {
  return (
    <>
      <ul className="grid gap-3 md:hidden" aria-label={caption}>{rows.map(row => (
        <li key={row.id}>
          <Link href={bookingHref(row.id)} className="grid gap-2 rounded-card bg-surface p-4 text-ink no-underline shadow-soft ring-1 ring-border/70 hover:ring-primary/40">
            <span className="flex items-start justify-between gap-3"><span className="grid min-w-0"><strong className="truncate">{row.client_name}</strong><span className="truncate text-sm text-muted">{row.service_name ?? "Booking"}</span></span><StatusBadge status={row.status} /></span>
            <span className="flex items-center justify-between gap-3 text-sm"><span className="text-muted">{when(row, timezone)}</span><span className="inline-flex items-center gap-1"><Money paise={row.total_paise} size="sm" /><ChevronRight className="size-4 text-muted" aria-hidden /></span></span>
          </Link>
        </li>
      ))}</ul>
      <div className="hidden md:block"><Table><caption className="sr-only">{caption}</caption><thead><tr><Th>Customer</Th><Th>Service</Th><Th>When</Th><Th>Status</Th><Th className="text-right">Paid / total</Th><Th><span className="sr-only">Open</span></Th></tr></thead><tbody>{rows.map(row => (
        <tr key={row.id}>
          <Td className="font-medium">{row.client_name}{row.client_email && <span className="block text-xs font-normal text-muted">{row.client_email}</span>}</Td>
          <Td className="text-muted">{row.service_name ?? "Booking"}</Td>
          <Td className="whitespace-nowrap tabular-nums">{when(row, timezone)}</Td>
          <Td><StatusBadge status={row.status} /></Td>
          <Td className="whitespace-nowrap text-right"><Money paise={row.paid_paise} size="sm" className="text-muted" /> / <Money paise={row.total_paise} size="sm" /></Td>
          <Td className="text-right"><Link href={bookingHref(row.id)} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium">Open<span className="sr-only"> booking for {row.client_name}</span><ChevronRight className="size-4" aria-hidden /></Link></Td>
        </tr>
      ))}</tbody></Table></div>
    </>
  );
}
