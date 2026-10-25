import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata } from "@/components/preview/legal-page";

export const metadata = legalMetadata("Refund policy");
export default function Refunds() {
  return <LegalPage title="Refund policy" version={POLICY_VERSIONS.booking_terms} intro="Each business sets its own cancellation rules. This page explains how refunds work on Bayana within those rules." sections={[
    { heading: "If you cancel", body: ["The refund follows the cancellation tiers shown before you booked and kept with your booking, for example a full refund until 7 days before and half until 48 hours before. The exact amount is shown before you confirm a cancellation, and that is the amount refunded."] },
    { heading: "If the business cancels", body: ["You get back everything you paid, in full."] },
    { heading: "If a payment arrives too late", body: ["If your payment is completed after your hold expired and the time is no longer free, the full amount is refunded automatically."] },
    { heading: "How and when", body: ["Online payments are refunded to the original payment method by Razorpay, usually within 5 to 7 working days. Money paid directly to the business is returned by the business."] },
    { heading: "Questions", body: ["Contact the business first. If something is not right, write to hello@bayana.in with your booking link."] }
  ]} />;
}
