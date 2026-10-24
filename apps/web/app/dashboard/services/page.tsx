import Link from "next/link";
import { GripVertical, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState, sampleServices } from "@/components/preview/sample";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, LoadingState, Money, Skeleton } from "@/components/ui/display";

export const metadata = previewMetadata("Services");
export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  return (
    <>
      <PreviewBanner>Service editing works today on the <Link href="/dashboard">overview page</Link>. This layout adds reordering, terms templates and cancellation tiers.</PreviewBanner>
      <PageHeader eyebrow="Services" title="What clients can book" actions={<Button>Add service</Button>} />
      {state === "loading" ? <LoadingState label="Loading services…" className="grid gap-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-20 rounded-card" />)}</LoadingState>
        : state === "empty" ? <EmptyState icon={<Sparkles />} title="Add your first service" description="A name, a price and how long it takes is enough to start. You can add terms later." action={<Button>Add service</Button>} />
        : <div className="grid gap-6">
          <ul className="grid gap-3" aria-label="Services, in display order">{sampleServices.map(service => (
            <li key={service.name} className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-soft ring-1 ring-border/70">
              <button type="button" className="-m-2 inline-flex size-11 cursor-grab items-center justify-center text-muted" aria-label={`Reorder ${service.name}`}><GripVertical className="size-5" aria-hidden /></button>
              <div className="grid flex-1 gap-0.5"><strong>{service.name}</strong><span className="text-sm text-muted">{service.duration} min · Advance {service.advance}</span></div>
              {!service.active && <Badge>Hidden</Badge>}<Money paise={service.price} className="font-semibold" />
            </li>
          ))}</ul>
          <Card><CardHeader title="Cancellation tiers" description="Applied to every booking of this service and frozen at booking time." />
            <ol className="grid gap-2 text-sm">{[["More than 7 days before", "Full advance refunded"], ["2 to 7 days before", "50% of advance refunded"], ["Less than 48 hours", "Advance kept"]].map(([when, what]) => <li key={when} className="flex flex-wrap justify-between gap-2 rounded-input bg-surface-muted px-4 py-3"><span className="font-medium">{when}</span><span className="text-muted">{what}</span></li>)}</ol>
          </Card>
        </div>}
    </>
  );
}
