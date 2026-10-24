import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState, sampleCustomers } from "@/components/preview/sample";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, LoadingState, Money, Skeleton, Table, Td, Th } from "@/components/ui/display";

export const metadata = previewMetadata("Customers");
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  return (
    <>
      <PreviewBanner />
      <PageHeader eyebrow="Customers" title="People who booked you" />
      {state === "loading" ? <LoadingState label="Loading customers…" className="grid gap-2">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-16" />)}</LoadingState>
        : state === "empty" ? <EmptyState icon={<Users />} title="No customers yet" description="Everyone who books you appears here with their booking history." />
        : <Table><thead><tr><Th>Customer</Th><Th className="hidden sm:table-cell">Bookings</Th><Th className="text-right">Paid</Th><Th className="hidden sm:table-cell">Last booking</Th></tr></thead><tbody>{sampleCustomers.map(customer => (
          <tr key={customer.email}><Td><div className="flex items-center gap-3"><Avatar name={customer.name} size="sm" /><div className="grid min-w-0"><span className="font-medium">{customer.name}</span><span className="truncate text-xs text-muted">{customer.email}</span></div></div></Td><Td className="hidden tabular-nums sm:table-cell">{customer.bookings}</Td><Td className="text-right"><Money paise={customer.spent} size="sm" /></Td><Td className="hidden text-muted sm:table-cell">{customer.last}</Td></tr>
        ))}</tbody></Table>}
    </>
  );
}
