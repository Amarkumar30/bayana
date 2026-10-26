import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata, type LegalSection } from "@/components/legal/legal-page";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Terms of service", "The terms that apply to everyone who uses Bayana: businesses who take bookings and customers who book them.");

const sections: LegalSection[] = [
  { heading: "What Bayana is, and what it is not", body: [
    `${business.tradingName} is a technology platform. It lets independent service providers ("vendors") publish a booking page, offer services and times, and take advance payments, and it lets their clients ("customers") book those services.`,
    "The service you book is provided by the vendor, not by us. The contract for the service (what is delivered, when, at what price and on what cancellation terms) is between the customer and the vendor. We are not a party to it, we do not provide or supervise the service, and we do not guarantee its quality, safety, legality or delivery.",
    "We provide the booking tools, keep a record of what each side agreed to, and process payments through our payment partner as described in section 6."
  ] },
  { heading: "Who these terms apply to", body: [
    "These terms apply to everyone who uses Bayana. Vendors also agree to the vendor agreement (/vendor-terms), which adds obligations specific to running a business on Bayana. If the two conflict on a vendor matter, the vendor agreement applies.",
    "Our privacy policy (/privacy) explains how we handle personal data, and our refund policy (/refunds) explains how cancellations and refunds work. Both form part of these terms.",
    "You must be at least 18 years old and able to enter into a binding contract under Indian law to create a vendor account or to book a service. A booking for someone under 18 must be made by a parent or guardian."
  ] },
  { heading: "Accounts and sign-in", body: [
    "Vendors sign in with Google, with a one-time code sent to their email, or with a password if they choose to set one. Customers do not need an account: they confirm their email with a one-time code each time they book.",
    "Keep access to your email account safe. Anyone who can read your email can sign in. You are responsible for activity under your account until you tell us it has been misused. Tell us at once at the support address if you think it has.",
    "Give accurate information. We may suspend an account that uses false details, or that we reasonably believe has been taken over."
  ] },
  { heading: "Vendor obligations and prohibited services", body: [
    "Vendors are independent businesses. They are responsible for their listings, prices, availability, terms, the service itself, and any licence, registration or permit their work needs. The vendor agreement sets this out in full.",
    "The following may not be offered or booked through Bayana:",
    { list: [
      "anything illegal in India or in the place the service is delivered, or anything that needs a licence the vendor does not hold;",
      "adult or sexual services, escort services, or services involving weapons, drugs, gambling, betting or lotteries;",
      "medical diagnosis or treatment, legal advice, or financial or investment advice, unless the vendor is properly qualified and registered to give it and says so on their page;",
      "services that exploit, endanger or discriminate against anyone, including children;",
      "anything misleading, including fake services or bookings used to collect money or personal data;",
      "anything Razorpay or the banking network does not allow to be paid for."
    ] },
    "We may remove a listing or suspend a vendor who offers a prohibited service, and we may report it to the authorities where the law requires."
  ] },
  { heading: "Bookings and holds", body: [
    "When a customer chooses a time and confirms their email, the time is held for them for a short period (currently 15 minutes) while they read and accept the vendor's terms and pay any advance. If the hold runs out, the time is released and another customer may book it.",
    "Before agreeing, the customer sees the vendor's service, price, advance, cancellation policy and terms. We store an exact copy of that text with the time, the customer's verified email, IP address and device as evidence of the agreement. Neither side can change that copy afterwards.",
    "A booking is confirmed only when the advance has been received: either a payment verified through our payment partner, or the vendor recording that they received the advance directly. Until then it is not a confirmed booking, and we never show it as one.",
    "If a payment arrives after the hold has run out, we confirm the booking if the time is still free; if someone else has booked it, the payment is refunded in full automatically."
  ] },
  { heading: "Payments and fees", body: [
    "Online payments are processed by Razorpay Software Private Limited, a payment aggregator regulated by the Reserve Bank of India. Card, UPI and bank details are entered on Razorpay's checkout and never reach our servers. We receive only the payment's status, amount and reference.",
    "How the money reaches the vendor depends on the arrangement in place for that vendor, which their booking page and receipt make clear:",
    { list: [
      "Paid to the vendor directly. The customer pays the vendor (for example in cash or by UPI to the vendor) and the vendor records the advance in Bayana. We never hold the money.",
      "Collected through Bayana. The customer pays through Razorpay checkout on Bayana, and the money is settled to the vendor through Razorpay, less any platform fee. Where we collect a payment this way, we do so only as a limited agent of the vendor for receiving it, and the customer's payment to us counts as payment to the vendor."
    ] },
    "Vendors pay the subscription and platform fees shown on the pricing page (/pricing), as current when the fee is charged. We will give at least 30 days' notice before raising a fee for an existing vendor.",
    "Customers pay the price and advance shown at booking. We do not add a charge to the customer's payment unless it is shown before they pay."
  ] },
  { heading: "Taxes", body: [
    "Each vendor is responsible for the taxes on their own services, including GST where they are registered or required to register, and for issuing any tax invoice their customers need. Receipts generated by Bayana record payments; they are not tax invoices unless the vendor's GST details appear on them.",
    `Our own fees are charged with GST where we are registered for it${business.gstin ? ` (GSTIN ${business.gstin})` : ""}, and we issue a tax invoice for them.`
  ] },
  { heading: "Cancellations and refunds", body: [
    "Each vendor sets their own cancellation and refund policy, and the version shown when a booking was made is the one that applies to it. Our refund policy (/refunds) explains how those rules are applied, the vendor-cancellation rule (a full refund) and refund timelines."
  ] },
  { heading: "Disputes and chargebacks", body: [
    "A disagreement about the service itself is between the customer and the vendor. Start by contacting the vendor; the booking page shows how.",
    "If that does not resolve it, write to us at the support address with the booking reference. We will look at the record (the agreed terms, payments, cancellations and messages we hold), share what is relevant with both sides, and may, where we collected the payment, decide whether a refund is due under the vendor's policy and these terms. We will not decide questions about the quality of a service.",
    "If a customer raises a chargeback or payment dispute with their bank, we provide the evidence we hold to Razorpay. Where the payment was collected through Bayana and the chargeback is upheld, the vendor bears the amount and any charge the payment network applies, as the vendor agreement explains."
  ] },
  { heading: "Content", body: [
    "Vendors are responsible for everything on their page: text, prices, images, terms and policies. It must be accurate, lawful, and theirs to use.",
    "By publishing content on Bayana, a vendor gives us a non-exclusive, royalty-free licence, for as long as it is published, to host, display and adapt it (for example resizing an image) to run the service and to show the vendor's page.",
    "We may remove content that breaks these terms or the law, or that we are told to remove by a court or government authority. To report content, write to the support address."
  ] },
  { heading: "Intellectual property", body: [
    `The Bayana software, name, logo and design belong to ${business.legalName} or its licensors. These terms give you the right to use Bayana as intended, nothing more. Do not copy, resell, reverse engineer or scrape it, or use our name in a way that suggests we endorse you.`
  ] },
  { heading: "Acceptable use", body: [
    { list: [
      "No false or abusive bookings, and no bookings made to block a vendor's calendar.",
      "No attempt to access another person's account, booking or data, to test our security without written permission, or to get around rate limits or verification.",
      "No automated access that loads or disrupts the service.",
      "No use of customer contact details for anything other than the booking (vendors) or the service booked (customers)."
    ] }
  ] },
  { heading: "Suspension and closing an account", body: [
    "We may suspend or close an account, or remove a listing, if it breaks these terms or the law, puts other users at risk, or if a court, regulator or our payment partner requires it. Where it is safe and lawful, we tell you why and how to respond. Confirmed bookings affected by a suspension are handled under the refund policy.",
    "You may close your account at any time from your settings, once there are no upcoming bookings. We keep the records described in the privacy policy for as long as the law requires."
  ] },
  { heading: "Disclaimers", body: [
    "Bayana is provided as it is and as available. We work to keep it running and accurate, but we do not promise it will be uninterrupted or error-free. The service may be briefly unavailable, for example while it starts up after a quiet period or during maintenance.",
    "We do not check every vendor's qualifications, and we make no promise about any vendor or service. Nothing in these terms limits any right you have under the Consumer Protection Act, 2019 or any other law that cannot be excluded."
  ] },
  { heading: "Limitation of liability", body: [
    "To the extent the law allows, we are not liable for any indirect or consequential loss, or for loss of profit, business, goodwill or data.",
    "To the extent the law allows, our total liability to you for all claims about Bayana in any 12-month period is limited to the greater of (a) the fees you paid us in that period, and (b) INR 5,000. For a customer, our liability about a booking is limited to the amount of that booking's payment that we collected.",
    "These limits do not apply to liability that cannot be limited by law, including for fraud or for death or personal injury caused by our negligence."
  ] },
  { heading: "Indemnity", body: [
    `Vendors will compensate ${business.legalName} for losses, claims and reasonable costs (including legal fees) that arise from their services, their content, their breach of these terms or the vendor agreement, or their breach of the law, including tax law.`
  ] },
  { heading: "Governing law and courts", body: [
    `These terms are governed by the laws of India. Subject to any right you have to bring a consumer complaint where you live, the courts at ${business.jurisdictionCity} have exclusive jurisdiction over any dispute about these terms or Bayana.`
  ] },
  { heading: "Changes to these terms", body: [
    "We may change these terms, for example when the law or the service changes. We show the version and effective date at the top of this page. For a change that affects your rights, we tell signed-in vendors by email or in the dashboard at least 15 days before it takes effect, unless the law requires it sooner.",
    "Bookings made before a change stay under the terms and vendor policy that were agreed when they were made. If you do not accept a change, close your account before it takes effect; using Bayana after that means you accept it."
  ] },
  { heading: "Contact and grievances", body: [
    `Questions about these terms: ${business.supportEmail}. Grievance officer: ${business.grievanceOfficer.name}, ${business.grievanceOfficer.email}. Our postal address is ${business.address}. The contact page (/contact) lists support hours and response times.`
  ] }
];

export default function Terms() {
  return <LegalPage title="Terms of service" version={POLICY_VERSIONS.account_terms} intro="These terms apply when you use Bayana, whether you book a service through it or take bookings for your own business. Please read them with the privacy policy, the refund policy and, for vendors, the vendor agreement." sections={sections} />;
}
