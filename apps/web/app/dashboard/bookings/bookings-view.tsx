"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ListChecks } from "lucide-react";
import { BOOKING_STATUSES } from "@bayana/shared";
import { PageHeader } from "@/components/layout/brand";
import { NewBookingDialog } from "@/components/dashboard/booking-actions";
import { BookingList } from "@/components/dashboard/booking-list";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { BookingList as BookingListData } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, Skeleton } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/field";

type Filters = { q: string; status: string; from: string; to: string };
const statusLabel: Record<string, string> = { HELD: "Held", PENDING: "Pending", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired", EXPIRED_PAID: "Expired, paid" };
const query = (filters: Filters, page: number) => { const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)); if (page > 1) params.set("page", String(page)); return params.toString(); };

/** SPEC 5.3 bookings list: search, status and date filters kept in the URL, then the list (cards on phones). */
export function BookingsView({ initial }: { initial: Filters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial); const [page, setPage] = useState(1);
  const qs = query(filters, page);
  const [state, reload] = useVendorData<BookingListData>(`/v1/vendor/bookings${qs ? `?${qs}` : ""}`);
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const next = { q: String(form.get("q") ?? "").trim(), status: String(form.get("status") ?? ""), from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") };
    setFilters(next); setPage(1); router.replace(`/dashboard/bookings${query(next, 1) ? `?${query(next, 1)}` : ""}`, { scroll: false });
  };
  const filtered = Object.values(filters).some(Boolean);
  const skeleton = <LoadingState label="Loading bookings…" className="grid gap-2">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-14" />)}</LoadingState>;
  return (
    <>
      <PageHeader eyebrow="Bookings" title="All bookings" description="Search, filter and open any booking to see its timeline, payments and contract." actions={<NewBookingDialog />} />
      <form onSubmit={apply} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_10rem_10rem_auto] lg:items-end" role="search" aria-label="Filter bookings">
        <Field label="Search">{p => <Input {...p} name="q" type="search" defaultValue={filters.q} placeholder="Name, email or booking id" />}</Field>
        <Field label="Status">{p => <Select {...p} name="status" defaultValue={filters.status}><option value="">All statuses</option>{BOOKING_STATUSES.map(status => <option key={status} value={status}>{statusLabel[status]}</option>)}</Select>}</Field>
        <Field label="From">{p => <Input {...p} name="from" type="date" defaultValue={filters.from} />}</Field>
        <Field label="To">{p => <Input {...p} name="to" type="date" defaultValue={filters.to} />}</Field>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
      <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard/bookings">{data => data.bookings.length === 0
        ? <EmptyState icon={<ListChecks />} title={filtered ? "No bookings match" : "No bookings yet"} description={filtered ? "Try another name, status or date range." : "Share your page link on WhatsApp or Instagram. New bookings appear here the moment someone reserves a time."} />
        : <div className="grid gap-4">
          <BookingList rows={data.bookings} timezone={data.timezone} caption="Bookings" />
          {(page > 1 || data.has_more) && <nav aria-label="Pages" className="flex items-center justify-between gap-2">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button><span className="text-sm text-muted">Page {page}</span><Button variant="secondary" disabled={!data.has_more} onClick={() => setPage(page + 1)}>Older</Button>
          </nav>}
        </div>}
      </Gate>
    </>
  );
}
