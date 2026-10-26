import { LegalPage, legalMetadata, type LegalSection } from "@/components/legal/legal-page";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Shipping and delivery policy", "Bayana is used to book services. Nothing is shipped; services are delivered by vendors at the booked time.");

const sections: LegalSection[] = [
  { heading: "No physical goods are shipped", body: [
    `${business.tradingName} is a platform for booking services, such as a photography session, a salon appointment, a tutoring class or a repair visit. We do not sell or ship physical goods, and nothing bought through Bayana is delivered by post or courier. There are no shipping charges.`
  ] },
  { heading: "How services are delivered", body: [
    "Each service is delivered by the vendor you booked, at the date, time and place (or online link) shown on your booking and in your confirmation email. Times are shown in the vendor's time zone, which is stated on the booking.",
    "Your booking is confirmed only once the advance has been received. You get a confirmation email straight away, and a reminder about 24 hours before the booking.",
    "Anything a vendor hands over as part of their service (for example edited photos or class notes) is delivered by that vendor, in the way and within the time they describe on their page."
  ] },
  { heading: "If the service is not delivered", body: [
    "If the vendor cancels or does not provide the service, the cancellation and refund policy (/refunds) applies: when the vendor cancels, you get a full refund of what you paid. If a vendor does not turn up and does not cancel, contact the vendor first and then us, with the booking reference."
  ] },
  { heading: "Contact", body: [
    `Questions: ${business.supportEmail}. The contact page (/contact) has our support hours and postal address.`
  ] }
];

export default function Shipping() {
  return <LegalPage title="Shipping and delivery policy" intro="Bayana is used to book services, not to buy goods. This page explains how what you book is delivered." sections={sections} />;
}
