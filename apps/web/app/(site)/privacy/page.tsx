import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata } from "@/components/preview/legal-page";

export const metadata = legalMetadata("Privacy policy");
export default function Privacy() {
  return <LegalPage title="Privacy policy" version={POLICY_VERSIONS.privacy_policy} intro="Bayana helps independent businesses take bookings and advances. This page explains what personal data we handle, why, who sees it, how long we keep it, and how you can see, take away or erase it, as the Digital Personal Data Protection Act, 2023 requires." sections={[
    { heading: "What we collect", body: ["If you book: your name, email address, phone number (when the business asks for it), any notes you write, the time you booked and the terms you agreed to, together with the time, your verified email and your device's network address as evidence of that agreement.", "If you run a business on Bayana: your sign-in email, your business profile and services, your hours, and the bookings and payments made with you.", "We never receive or store card numbers or bank details. Online payments are handled entirely by Razorpay."] },
    { heading: "Why we use it", body: ["To verify your email with a one-time code, hold and confirm your booking, record payments and refunds, send confirmations, reminders and receipts, and keep a record of what was agreed in case of a dispute. We do not sell your data or use it for advertising."] },
    { heading: "Who sees it", body: ["The business you book sees your booking details so they can serve you. Razorpay processes payments; our email provider delivers our emails; our hosting and database providers store the data for us. Each of them acts only on our instructions."] },
    { heading: "How long we keep it", body: ["Sign-in codes are deleted within a day. Email content is removed after 90 days. Booking, payment, refund and agreement records are kept as long as tax and accounting law requires; if you erase your data, we keep those records with your name, email, phone and notes removed."] },
    { heading: "Your consent and your rights", body: ["We record when you agreed to these terms and which version. You can see everything we hold about you and download it from My bookings (customers) or Settings (businesses), and erase it there too. Erasing removes your sign-in and personal details; it cannot remove money records the law makes us keep, and it waits until no booking of yours is still coming up."] },
    { heading: "Cookies", body: ["We use one sign-in cookie, and during Google sign-in a short-lived cookie that protects that sign-in. We do not use advertising or tracking cookies."] },
    { heading: "Grievance officer and contact", body: ["Write to hello@bayana.in with any question or complaint about your data. We reply within 7 days. Placeholder: the name and address of the grievance officer will be published here before launch."] }
  ]} />;
}
