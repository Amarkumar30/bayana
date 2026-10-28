import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata, type LegalSection } from "@/components/legal/legal-page";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Vendor agreement", "The agreement between Bayana and the independent businesses that take bookings through it.");

const sections: LegalSection[] = [
  { heading: "The parties and how this agreement fits", body: [
    `This agreement is between ${business.legalName} ("we") and the business that creates a vendor account on Bayana ("you"). It adds to the terms of service (/terms), which also apply. If they conflict on a matter about your business on Bayana, this agreement applies.`,
    "You accept it when you create your account. We record the version and the time."
  ] },
  { heading: "You are an independent business", body: [
    "You provide your services as an independent business, on your own account. You are not our employee, agent, partner or franchisee, and nothing in this agreement creates that relationship. You decide how, when and whether to provide your services, and your prices.",
    "You are the provider of the service to the customer. The contract for the service is between you and the customer, on the terms the customer agreed to when booking."
  ] },
  { heading: "Accurate listings", body: [
    { list: [
      "Describe each service, its price, duration and what is included accurately and completely, and keep your availability up to date.",
      "Show any advance, and any extra charges, clearly before a customer books. Do not charge a customer more than the agreed price without their clear agreement.",
      "Use only content (text, images, names) that you own or are allowed to use.",
      "Offer only lawful services that you are qualified to provide, and none of those prohibited by the terms of service."
    ] }
  ] },
  { heading: "Your taxes, licences and records", body: [
    "You are responsible for:",
    { list: [
      "registering for and paying GST, income tax and any other tax on your income from bookings, and issuing tax invoices to customers where the law requires (Bayana's receipts are not your tax invoices unless your GSTIN appears on them);",
      "holding every licence, registration, permit and insurance your services need;",
      "keeping your own business records as the law requires; you can export your bookings and payments from Settings at any time."
    ] },
    "Where the law requires us to collect or deduct tax from payments we settle to you (for example tax collected at source by an e-commerce operator under GST, or tax deducted at source under income tax), we will do so, show it on your statement, and provide the certificates the law requires."
  ] },
  { heading: "Your cancellation policy and your duties", body: [
    "You set your own cancellation policy on Bayana. It must be clear and fair, and it applies to each booking exactly as the customer agreed to it.",
    { list: [
      "Honour every confirmed booking. If you must cancel, do it from your dashboard as early as possible and give the reason. The customer is then refunded in full, whatever your policy says.",
      "Where an advance was paid to you directly (cash, UPI to you, bank transfer), refund the customer yourself within 7 days of any cancellation that calls for a refund, and record it in Bayana.",
      "Do not ask customers to cancel on Bayana and pay you outside it to avoid fees, or to avoid your cancellation policy.",
      "Repeated cancellations or no-shows may lead to suspension."
    ] }
  ] },
  { heading: "Payments, payouts and fees", body: [
    "How customer payments reach you depends on the arrangement set up for your account. Your dashboard shows which applies.",
    { list: [
      "Paid to you directly: customers pay you, and you record the advance in Bayana to confirm the booking. We do not handle the money. Record only payments you have actually received.",
      "Collected through Bayana: customers pay through Razorpay checkout on Bayana. We receive these payments only as your limited agent for receiving them, and a customer's payment to us discharges their obligation to pay you that amount. We settle the money to your verified bank account through Razorpay, after deducting our platform fee, any payment gateway charges stated on the pricing page, refunds and any amounts the law requires us to deduct. We tell you the settlement timing when this arrangement is switched on for your account, and it requires you to complete Razorpay's KYC."
    ] },
    "You pay the subscription and platform fees shown on the pricing page (/pricing), plus GST. We give you at least 30 days' notice before raising a fee. Fees already paid are not refundable, except where we charged you in error.",
    "Where a customer's payment collected through Bayana is refunded under your cancellation policy, cancelled by you, or reversed by a chargeback that is upheld, the amount (and any charge the payment network applies to a chargeback) is deducted from your next settlement or, if there is none, you repay it within 15 days of our request. We may hold back settlement of a disputed amount while a dispute is open."
  ] },
  { heading: "Customer data", body: [
    "You receive your customers' names, emails, phone numbers (if you ask for them) and booking details so that you can provide the service they booked. You must use this data only for that booking and the service, keep it secure, not sell or share it, and not send marketing to a customer unless they have separately agreed. Where you use it for your own purposes, you are responsible for it under the Digital Personal Data Protection Act, 2023.",
    "If a customer asks you to delete their data, delete what you hold outside Bayana and tell us, so we can handle the rest."
  ] },
  { heading: "Suspension and termination", body: [
    "You may close your account at any time from Settings, once you have no upcoming bookings.",
    "We may suspend or close your account, hide your page or hold settlements, with notice where it is safe and lawful, if you break this agreement or the terms of service, if customers report fraud or serious problems, if our payment partner requires it, or if the law requires it. Confirmed bookings affected are cancelled and refunded in full.",
    "Sections on taxes, refunds and chargebacks, customer data, indemnity and liability continue after the account is closed, until every amount between us is settled."
  ] },
  { heading: "Liability and indemnity", body: [
    `The limitation of liability in the terms of service applies to this agreement. You will compensate ${business.legalName} for losses, claims and reasonable costs (including legal fees) arising from your services, your content, your taxes, your handling of customer data, or your breach of this agreement or the law.`
  ] },
  { heading: "Changes, law and courts", body: [
    `We may change this agreement as the terms of service describe, with at least 15 days' notice of changes that affect your rights or fees (30 days for fee increases). It is governed by the laws of India, and the courts at ${business.jurisdictionCity} have exclusive jurisdiction.`
  ] }
];

export default function VendorTerms() {
  return <LegalPage title="Vendor agreement" version={POLICY_VERSIONS.vendor_terms} intro="This agreement applies to every business that takes bookings through Bayana. It sets out what you are responsible for, how payments and fees work, and what we can do if something goes wrong." sections={sections} />;
}
