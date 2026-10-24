import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState, sampleLedger } from "@/components/preview/sample";
import { Badge, Card, EmptyState, LoadingState, Money, Notice, Skeleton, Table, Td, Th } from "@/components/ui/display";

export const metadata = previewMetadata("Payments");
const totals = [{ label: "Collected this month", value: 285000 }, { label: "Balances due", value: 1065000 }, { label: "Refunded", value: 180000 }];
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  return (
    <>
      <PreviewBanner />
      <PageHeader eyebrow="Payments" title="Money in and out" description="Every advance, balance and refund, recorded once." />
      <Notice tone="info" className="mb-6">Online payments are not enabled yet. You can still record cash or UPI advances against a booking.</Notice>
      {state === "loading" ? <LoadingState label="Loading payments…" className="grid gap-4"><div className="grid gap-4 sm:grid-cols-3">{totals.map(total => <Skeleton key={total.label} className="h-24 rounded-card" />)}</div><Skeleton className="h-64 rounded-card" /></LoadingState>
        : state === "empty" ? <EmptyState icon={<Wallet />} title="No payments recorded yet" description="Advances appear here when a client pays or when you record an offline payment." />
        : <div className="grid gap-6">
          <dl className="grid gap-4 sm:grid-cols-3">{totals.map(total => <Card key={total.label} className="grid gap-1"><dt className="text-sm text-muted">{total.label}</dt><dd><Money paise={total.value} size="xl" /></dd></Card>)}</dl>
          <Table><caption className="sr-only">Payment ledger</caption><thead><tr><Th>Date</Th><Th>Description</Th><Th className="hidden sm:table-cell">Method</Th><Th className="text-right">Amount</Th></tr></thead><tbody>{sampleLedger.map(entry => (
            <tr key={entry.description}><Td className="whitespace-nowrap text-muted">{entry.date}</Td><Td>{entry.description}{entry.kind === "refund" && <Badge tone="danger" className="ml-2">Refund</Badge>}</Td><Td className="hidden text-muted sm:table-cell">{entry.method}</Td><Td className="text-right"><Money paise={entry.amount} size="sm" className={entry.amount < 0 ? "text-danger" : "font-semibold"} /></Td></tr>
          ))}</tbody></Table>
        </div>}
    </>
  );
}
