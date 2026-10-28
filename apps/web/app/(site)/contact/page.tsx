import { DraftNotice, legalMetadata } from "@/components/legal/legal-page";
import { PageHeader } from "@/components/layout/brand";
import { Card } from "@/components/ui/display";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Contact us", "How to reach Bayana: support email and phone, support hours, postal address and the grievance officer.");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm font-semibold text-ink">{label}</dt><dd className="text-muted">{children}</dd></div>;
}

export default function Contact() {
  return (
    <div className="mx-auto max-w-3xl">
      <DraftNotice />
      <PageHeader eyebrow="Contact" title="Contact us" description="For a question about a booking, contact the business first: their details are on your booking page. For anything about Bayana itself, we are here." />
      <div className="grid gap-6">
        <Card>
          <h2 className="mb-4 text-lg">Support</h2>
          <dl className="grid gap-4">
            <Row label="Email"><a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a></Row>
            <Row label="Phone">{business.phone}</Row>
            <Row label="Support hours">{business.supportHours}</Row>
            <Row label="Response time">We reply {business.responseTime}.</Row>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg">Business details</h2>
          <dl className="grid gap-4" data-testid="published-by">
            <Row label="Legal name">{business.legalName}</Row>
            <Row label="Trading as">{business.tradingName}</Row>
            <Row label="Type of entity">{business.entityType}</Row>
            <Row label="Registered office">{business.address}</Row>
            {business.gstin && <Row label="GSTIN">{business.gstin}</Row>}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg">Grievance officer</h2>
          <p className="mb-4 text-sm text-muted">For complaints about how we handle your personal data (Digital Personal Data Protection Act, 2023) or about the platform, after contacting support. We acknowledge a grievance within 48 hours and resolve it within 30 days.</p>
          <dl className="grid gap-4">
            <Row label="Name">{business.grievanceOfficer.name}</Row>
            <Row label="Email"><a href={`mailto:${business.grievanceOfficer.email}`}>{business.grievanceOfficer.email}</a></Row>
            <Row label="Post">{business.legalName}, {business.address}</Row>
          </dl>
        </Card>
      </div>
    </div>
  );
}
