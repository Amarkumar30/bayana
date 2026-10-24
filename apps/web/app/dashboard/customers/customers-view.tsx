"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ChevronDown, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { formatDate } from "@/components/booking/time";
import { bookingHref } from "@/components/dashboard/booking-list";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { Customer } from "@/components/dashboard/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, Money, Skeleton, StatusBadge, Table, Td, Th } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

function History({ customer, timezone }: { customer: Customer; timezone: string }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary">{customer.bookings} booking{customer.bookings === 1 ? "" : "s"}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
      <ul className="mt-1 grid gap-1">{customer.history.map(booking => <li key={booking.id}><Link href={bookingHref(booking.id)} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-input bg-surface-muted px-3 py-2 text-sm text-ink no-underline hover:text-primary"><span>{booking.service_name ?? "Booking"} · {formatDate(booking.starts_at, timezone, "short")}</span><StatusBadge status={booking.status} /></Link></li>)}</ul>
    </details>
  );
}

/** SPEC 5.3 customers: everyone who booked, grouped by email, with their booking history. */
export function CustomersView() {
  const [q, setQ] = useState("");
  const [state, reload] = useVendorData<{ timezone: string; customers: Customer[] }>(`/v1/vendor/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const search = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setQ(String(new FormData(event.currentTarget).get("q") ?? "").trim()); };
  const skeleton = <LoadingState label="Loading customers…" className="grid gap-2">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-16" />)}</LoadingState>;
  return (
    <>
      <PageHeader eyebrow="Customers" title="People who booked you" />
      <form onSubmit={search} role="search" aria-label="Search customers" className="mb-4 flex flex-wrap items-end gap-3"><Field label="Search" className="min-w-0 flex-1">{p => <Input {...p} name="q" type="search" placeholder="Name or email" defaultValue={q} />}</Field><Button type="submit" variant="secondary">Search</Button></form>
      <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard/customers">{({ customers, timezone }) => customers.length === 0
        ? <EmptyState icon={<Users />} title={q ? "No customers match" : "No customers yet"} description={q ? "Try another name or email." : "Everyone who books you appears here with their booking history."} />
        : <>
          <ul className="grid gap-3 md:hidden" aria-label="Customers">{customers.map(customer => (
            <li key={customer.email} className="grid gap-2 rounded-card bg-surface p-4 shadow-soft ring-1 ring-border/70">
              <div className="flex items-center gap-3"><Avatar name={customer.name} size="sm" /><div className="grid min-w-0"><span className="font-medium">{customer.name}</span><a href={`mailto:${customer.email}`} className="truncate text-xs">{customer.email}</a>{customer.phone && <a href={`tel:${customer.phone}`} className="text-xs">{customer.phone}</a>}</div></div>
              <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted">Paid <Money paise={customer.paid_paise} size="sm" /></span><span className="text-muted">Last {formatDate(customer.last_starts_at, timezone, "short")}</span></div>
              <History customer={customer} timezone={timezone} />
            </li>
          ))}</ul>
          <div className="hidden md:block"><Table><caption className="sr-only">Customers</caption><thead><tr><Th>Customer</Th><Th>Phone</Th><Th>Bookings</Th><Th className="text-right">Paid</Th><Th>Last booking</Th></tr></thead><tbody>{customers.map(customer => (
            <tr key={customer.email} className="align-top"><Td><div className="flex items-center gap-3"><Avatar name={customer.name} size="sm" /><div className="grid min-w-0"><span className="font-medium">{customer.name}</span><a href={`mailto:${customer.email}`} className="truncate text-xs">{customer.email}</a></div></div></Td><Td className="text-muted">{customer.phone ?? "—"}</Td><Td><History customer={customer} timezone={timezone} /></Td><Td className="text-right"><Money paise={customer.paid_paise} size="sm" /></Td><Td className="whitespace-nowrap text-muted">{formatDate(customer.last_starts_at, timezone, "short")}</Td></tr>
          ))}</tbody></Table></div>
        </>}
      </Gate>
    </>
  );
}
