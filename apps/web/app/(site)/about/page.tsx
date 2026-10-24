import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { Card } from "@/components/ui/display";

export const metadata = previewMetadata("About");
export default function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <PreviewBanner>Company story and team details are placeholders.</PreviewBanner>
      <PageHeader eyebrow="About" title="Why Bayana exists" />
      <div className="grid gap-6 text-lg leading-relaxed text-muted">
        <p>Most independent professionals in India take bookings over WhatsApp: a dozen messages to agree a time, a screenshot of a UPI payment, and hope that nobody else booked the same slot.</p>
        <p>Bayana replaces that with one link. Clients see what you offer, pick a time that is genuinely free, read your terms and pay an advance. You see a calendar you can trust.</p>
        <Card className="text-base"><h2 className="mb-2 text-lg text-ink">What we promise</h2><p>We never show a booking as confirmed until the money is verified, and we never hold your clients' card details.</p></Card>
      </div>
    </div>
  );
}
