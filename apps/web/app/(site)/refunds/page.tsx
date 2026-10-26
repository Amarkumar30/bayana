import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata, type LegalSection } from "@/components/legal/legal-page";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Cancellation and refund policy", "How cancellations and refunds work on Bayana: the vendor's policy agreed at booking, full refunds when a vendor cancels, timelines and disputes.");

const sections: LegalSection[] = [
  { heading: "Each booking follows the policy agreed when it was made", body: [
    "Every vendor on Bayana sets their own cancellation policy. Before a customer agrees to a booking, they see that policy in full: for example \"Cancel at least 48 hours before the start: 100% of the advance is refunded. Cancel at least 24 hours before: 50%. Later: no refund.\"",
    "We store an exact copy of the policy with the booking at the moment the customer agrees. That copy is what applies to the booking, even if the vendor changes their policy later. Both the customer and the vendor can see it on the booking page."
  ] },
  { heading: "When the customer cancels", body: [
    "A customer can cancel a booking from the booking page (the link in their confirmation email) until the booking starts. The page shows the exact refund before they confirm the cancellation.",
    "How the refund is calculated:",
    { list: [
      "We take the time left before the booking starts, and the first rule in the agreed policy whose notice period is met.",
      "The refund is that rule's percentage of the amount actually paid for the booking, rounded to the nearest paisa (half a paisa rounds up). It is never more than was paid.",
      "If no rule is met, or the booking has already started, no refund is due under the policy.",
      "If the vendor's policy says the advance is not refundable, no refund is due when the customer cancels."
    ] },
    "A vendor may always choose to refund more than their policy requires."
  ] },
  { heading: "When the vendor cancels", body: [
    "If a vendor cancels a confirmed booking for any reason, the customer gets a full refund of everything they paid for it, whatever the vendor's policy says. The vendor must give a reason, and we email it to the customer."
  ] },
  { heading: "When a payment arrives too late", body: [
    "A time is held for a short period while the customer pays. If the payment arrives after the hold has expired and someone else has booked that time, the payment is refunded in full automatically. If the time is still free, the booking is confirmed instead."
  ] },
  { heading: "How refunds are paid, and how long they take", body: [
    "How the refund reaches the customer depends on how the advance was paid:",
    { list: [
      "Paid online through Bayana (Razorpay): we start the refund through Razorpay automatically when the booking is cancelled, back to the same card, UPI account or bank account. Razorpay normally completes refunds within 5 to 7 working days; the customer's bank may take a few more days to show it. The booking page shows the refund's status.",
      "Paid to the vendor directly (cash, UPI to the vendor, bank transfer): the vendor must refund the customer directly, within 7 days of the cancellation, by the same method or another the customer agrees to. Bayana records the cancellation and the refund due, but does not hold this money and cannot send it."
    ] }
  ] },
  { heading: "Fees", body: [
    "Customers pay no Bayana fee. The full amount a customer paid for a booking is the amount the refund rules apply to.",
    "Fees vendors pay to Bayana (subscription and platform fees, see /pricing) are not refundable to the vendor when a booking is cancelled, except where we refund a payment that should not have been charged. Payment gateway charges on a refunded online payment are borne as set out in the vendor agreement."
  ] },
  { heading: "If something goes wrong", body: [
    "If a refund has not arrived within the time above, or you think the wrong amount was refunded:",
    { list: [
      "First check the booking page, which shows every payment, refund and its status.",
      "Contact the vendor; the booking page shows how.",
      `If that does not settle it, write to ${business.supportEmail} with the booking reference. We look at the agreed policy and the payment record and reply within ${business.responseTime}. Where the payment was collected through Bayana, we can correct a refund that was calculated wrongly.`,
      `If you are still not satisfied, write to our grievance officer, ${business.grievanceOfficer.name}, at ${business.grievanceOfficer.email}.`
    ] },
    "Raising a chargeback with your bank while we are looking into a refund can delay it. Please contact us first."
  ] },
  { heading: "Services, not goods", body: [
    "Bayana is used to book services delivered by vendors at the booked time and place. Nothing is shipped, so there are no returns or exchanges. See the shipping and delivery policy (/shipping)."
  ] }
];

export default function Refunds() {
  return <LegalPage title="Cancellation and refund policy" version={POLICY_VERSIONS.refund_policy} intro="This policy explains what happens to money paid for a booking when the booking is cancelled, by the customer or by the vendor. It applies alongside each vendor's own cancellation policy, which you see and agree to before booking." sections={sections} />;
}
