import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/brand";
import { Card } from "@/components/ui/display";
import { businessDetails as business } from "@/lib/business-details";

export const metadata: Metadata = { title: "About | Bayana", description: "Why Bayana exists and how it works: advance bookings for independent service professionals in India." };

export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="About" title="Why Bayana exists" />
      <div className="grid gap-6 text-lg leading-relaxed text-muted">
        <p>Most independent professionals in India take bookings over WhatsApp: a dozen messages to agree a time, a screenshot of a UPI payment, and hope that nobody else booked the same slot.</p>
        <p>Bayana replaces that with one link. Clients see what you offer, pick a time that is genuinely free, read your terms and pay an advance. You see a calendar you can trust.</p>
        <Card className="text-base">
          <h2 className="mb-3 text-lg text-ink">How it works</h2>
          <ul className="grid list-disc gap-2 pl-5">
            <li>Photographers, salons, tutors, consultants, trainers, event planners and repair professionals publish a booking page at bayana.in/your-name.</li>
            <li>A customer picks a service and a time, confirms their email, and agrees to the business&apos;s terms. We keep an exact copy of what was agreed.</li>
            <li>The advance is paid online through Razorpay, or directly to the business, which records it. The booking is confirmed only once the money is in.</li>
            <li>Both sides see the same booking, payments and refunds, and both get emails at each step.</li>
          </ul>
        </Card>
        <Card className="text-base">
          <h2 className="mb-2 text-lg text-ink">What we promise</h2>
          <p>We never show a booking as confirmed until the money is verified, we never see or store card details, and we never sell anyone&apos;s data. The service itself is provided by the business you book; Bayana is the platform that connects you.</p>
        </Card>
        <p className="text-base">{business.tradingName} is operated by {business.legalName}, {business.address}. <Link href="/contact">Contact us</Link>.</p>
      </div>
    </div>
  );
}
