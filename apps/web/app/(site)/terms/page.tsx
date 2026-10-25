import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata } from "@/components/preview/legal-page";

export const metadata = legalMetadata("Terms of service");
export default function Terms() {
  return <LegalPage title="Terms of service" version={POLICY_VERSIONS.account_terms} intro="These terms apply when you use Bayana, either to book a business or to take bookings for your own business." sections={[
    { heading: "What Bayana is", body: ["Bayana is software that lets independent businesses publish a booking page, take bookings and collect advances. The service you book is provided by the business, not by Bayana."] },
    { heading: "Bookings and the business's own terms", body: ["When you book, you agree to the business's terms, cancellation rules and price as shown before you confirm. We keep an exact copy of what you agreed to, and both you and the business can see it."] },
    { heading: "Payments", body: ["Advances paid online go through Razorpay to the business. A booking is confirmed only after the payment is verified. Money paid directly to the business (cash, UPI to them) is recorded by the business."] },
    { heading: "Your account", body: ["Businesses sign in with Google, an email code, or a password if they set one. Keep access to your email safe: it is how you get back in. You are responsible for what happens under your account."] },
    { heading: "Fair use", body: ["Do not misuse Bayana: no false bookings, no attempts to access other people's data, and no automated abuse. We may suspend accounts that do."] },
    { heading: "Liability", body: ["Placeholder: limits of liability and the governing law and courts will be completed after legal review."] }
  ]} />;
}
