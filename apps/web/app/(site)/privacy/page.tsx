import { previewMetadata } from "@/components/layout/preview-banner";
import { LegalPage } from "@/components/preview/legal-page";

export const metadata = previewMetadata("Privacy policy");
export default function Privacy() {
  return <LegalPage title="Privacy policy" sections={[
    { heading: "What we collect", body: "Placeholder: names, email addresses, phone numbers and booking details needed to make and manage a booking." },
    { heading: "Why we collect it", body: "Placeholder: to verify identity by email, hold and confirm bookings, and send receipts and reminders." },
    { heading: "Who we share it with", body: "Placeholder: the business you book, and payment and email providers acting on our behalf." },
    { heading: "Your rights", body: "Placeholder: access, correction, erasure and withdrawal of consent under the Digital Personal Data Protection Act, 2023." },
    { heading: "Grievance officer", body: "Placeholder: contact hello@bayana.in." }
  ]} />;
}
