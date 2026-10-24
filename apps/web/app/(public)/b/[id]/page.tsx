import { CalendarPlus, Download, FileText } from "lucide-react";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState } from "@/components/preview/sample";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, LoadingState, Money, Notice, Skeleton, StatusBadge, Table, Td, Th } from "@/components/ui/display";

export const metadata = previewMetadata("Your booking");
/** Customer booking page per SPEC 5.2 (token-protected). Today's working page lives at /booking/[id]. */
export default async function CustomerBooking({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  if (state === "loading") return <LoadingState label="Loading your booking…" className="grid gap-4"><Skeleton className="h-6 w-28" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-48 rounded-card" /><Skeleton className="h-40 rounded-card" /></LoadingState>;
  return (
    <div className="grid gap-6">
      <PreviewBanner>Sample booking. The live page will load by private link.</PreviewBanner>
      <div className="flex items-center gap-3"><Avatar name="Studio Sunday" /><div className="grid"><span className="text-sm text-muted">Your booking with</span><strong>Studio Sunday</strong></div></div>
      <div className="grid gap-2"><StatusBadge status="confirmed" className="w-fit" /><h1 className="text-2xl sm:text-4xl">Monday 2 November, 10:00</h1><p className="text-muted">Design consultation · 60 minutes · Asia/Kolkata</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary"><CalendarPlus aria-hidden />Add to calendar</Button><Button variant="ghost"><FileText aria-hidden />View contract</Button></div>
      <Card><CardHeader title="Payment summary" />
        <dl className="grid gap-2 text-sm"><div className="flex justify-between"><dt className="text-muted">Total</dt><dd><Money paise={250000} /></dd></div><div className="flex justify-between"><dt className="text-muted">Advance paid</dt><dd><Money paise={50000} /></dd></div><div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Balance on the day</dt><dd><Money paise={200000} /></dd></div></dl>
      </Card>
      <section aria-labelledby="history" className="grid gap-3"><h2 id="history" className="text-lg">Payment history</h2>
        {state === "empty" ? <Notice tone="info">No payments yet. Your advance will appear here once it's verified.</Notice> :
          <Table><thead><tr><Th>Date</Th><Th>Payment</Th><Th className="text-right">Amount</Th><Th><span className="sr-only">Receipt</span></Th></tr></thead><tbody><tr><Td className="text-muted">28 Oct</Td><Td>Advance · Razorpay</Td><Td className="text-right"><Money paise={50000} size="sm" /></Td><Td className="text-right"><Button size="icon" variant="ghost" aria-label="Download receipt"><Download aria-hidden /></Button></Td></tr></tbody></Table>}
      </section>
      <Card className="grid gap-3"><CardHeader title="Need to change something?" description="Free cancellation until 26 October. After that, the advance is kept." /><div className="flex flex-col gap-2 sm:flex-row"><Button variant="secondary" disabled>Reschedule</Button><Button variant="ghost" disabled>Cancel booking</Button></div></Card>
    </div>
  );
}
