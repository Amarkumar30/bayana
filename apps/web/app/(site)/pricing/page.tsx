import Link from "next/link";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/display";

export const metadata = previewMetadata("Pricing");
const plans = [
  { name: "Starter", price: "Plan A", blurb: "For getting your first online bookings.", features: ["Public booking page", "Unlimited services", "Email verification for every client", "Offline advance recording"] },
  { name: "Professional", price: "Plan B", blurb: "For busy schedules and online advances.", features: ["Everything in Starter", "Online advance payments", "Calendar feed", "Reminders before each booking"], featured: true }
];
export default function Pricing() {
  return (
    <>
      <PreviewBanner>Prices are not decided yet (SPEC decision D1). Plan names and features are placeholders for layout review.</PreviewBanner>
      <PageHeader eyebrow="Pricing" title="Simple pricing, decided soon" description="Placeholder plans so the page layout can be reviewed." />
      <div className="grid gap-6 md:grid-cols-2">{plans.map(plan => (
        <Card key={plan.name} className={plan.featured ? "ring-2 ring-primary" : ""}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg">{plan.name}</h2>{plan.featured && <Badge tone="primary">Most popular</Badge>}</div>
          <p className="mb-1 font-serif text-4xl">{plan.price}</p><p className="mb-6 text-muted">{plan.blurb}</p>
          <ul className="mb-6 grid gap-2">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{feature}</li>)}</ul>
          <Button asChild block variant={plan.featured ? "primary" : "secondary"}><Link href="/dashboard">Start with {plan.name}</Link></Button>
        </Card>
      ))}</div>
    </>
  );
}
