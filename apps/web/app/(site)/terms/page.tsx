import { previewMetadata } from "@/components/layout/preview-banner";
import { LegalPage } from "@/components/preview/legal-page";

export const metadata = previewMetadata("Terms of service");
export default function Terms() {
  return <LegalPage title="Terms of service" sections={[
    { heading: "Using Bayana", body: "Placeholder: who may use the service and the responsibilities of vendors and customers." },
    { heading: "Bookings and advances", body: "Placeholder: how holds, advances and confirmations work, and that each vendor sets their own terms." },
    { heading: "Fees", body: "Placeholder: platform and payment-processing fees, to be decided." },
    { heading: "Liability", body: "Placeholder: limits of Bayana's liability for services provided by vendors." }
  ]} />;
}
