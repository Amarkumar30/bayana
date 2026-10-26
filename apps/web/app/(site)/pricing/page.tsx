import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/display";
import { businessDetails as business } from "@/lib/business-details";

export const metadata: Metadata = { title: "Pricing | Bayana", description: "Bayana's current plans for businesses, the platform fee on online advances, and how GST is charged. Customers pay no Bayana fee." };

const { pricing } = business;
const plans = [
  { name: "Free", price: "₹0", period: "", blurb: "To start taking bookings online.", fee: `${pricing.freePlatformFeePercent}% platform fee on advances collected online through Bayana`, features: ["One service", "Up to 5 online bookings a month", "Booking page with Bayana branding", "Email verification for every customer", "Offline advance recording"] },
  { name: "Pro", price: `₹${pricing.proMonthlyInr}`, period: "per month", blurb: "For a full calendar and online advances.", fee: `${pricing.proPlatformFeePercent}% platform fee on advances collected online through Bayana`, features: ["Unlimited services and bookings", "Your own booking terms", "Reminders before each booking", "Calendar feed for your phone", "Lower platform fee"], featured: true }
];

export default function Pricing() {
  return (
    <>
      <PageHeader eyebrow="Pricing" title="Current prices" description={`Prices for businesses, effective ${business.effectiveDate}. Customers who book never pay a Bayana fee.`} />
      <div className="grid gap-6 md:grid-cols-2">{plans.map(plan => (
        <Card key={plan.name} className={plan.featured ? "ring-2 ring-primary" : ""}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg">{plan.name}</h2>{plan.featured && <Badge tone="primary">Most popular</Badge>}</div>
          <p className="mb-1"><span className="font-serif text-4xl">{plan.price}</span> {plan.period && <span className="text-muted">{plan.period}</span>}</p>
          <p className="mb-2 text-muted">{plan.blurb}</p>
          <p className="mb-6 text-sm text-ink">{plan.fee}</p>
          <ul className="mb-6 grid gap-2">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{feature}</li>)}</ul>
          <Button asChild block variant={plan.featured ? "primary" : "secondary"}><Link href="/signup">Start with {plan.name}</Link></Button>
        </Card>
      ))}</div>
      <Card className="mt-8 grid gap-3 text-sm leading-relaxed text-muted">
        <h2 className="text-lg text-ink">How fees and GST work</h2>
        <p><strong className="text-ink">Who charges.</strong> Subscriptions and platform fees are charged by {business.legalName}, which operates {business.tradingName}.</p>
        <p><strong className="text-ink">Platform fee.</strong> Charged only on advances a customer pays online through Bayana, as a percentage of the advance, and deducted before the money is settled to you. Advances paid to you directly (cash, UPI to you) carry no platform fee.</p>
        <p><strong className="text-ink">Payment gateway charges.</strong> Razorpay&apos;s charges for online payments are separate from the platform fee and are deducted from settlements at Razorpay&apos;s published rates.</p>
        <p><strong className="text-ink">GST.</strong> All prices are shown without GST. GST at the applicable rate (currently 18%) is added to the subscription and the platform fee{business.gstin ? `, and we issue a tax invoice under GSTIN ${business.gstin}` : " once we are registered for GST, and we will issue a tax invoice"}. The GST on your own services is yours to charge and pay.</p>
        <p><strong className="text-ink">Changes.</strong> We give existing businesses at least 30 days&apos; notice before a price rises. See the <Link href="/vendor-terms">vendor agreement</Link> and <Link href="/terms">terms of service</Link>.</p>
      </Card>
    </>
  );
}
