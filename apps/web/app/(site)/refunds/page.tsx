import { previewMetadata } from "@/components/layout/preview-banner";
import { LegalPage } from "@/components/preview/legal-page";

export const metadata = previewMetadata("Refund policy");
export default function Refunds() {
  return <LegalPage title="Refund policy" sections={[
    { heading: "Vendor cancellation policies", body: "Placeholder: each service has its own cancellation tiers, shown before you pay and frozen with your booking." },
    { heading: "Vendor-initiated cancellations", body: "Placeholder: if the vendor cancels, the advance is refunded in full." },
    { heading: "Late payments", body: "Placeholder: if a payment arrives after a hold expires and the time is taken, it is refunded automatically." },
    { heading: "Refund timelines", body: "Placeholder: typical bank and UPI processing times." }
  ]} />;
}
