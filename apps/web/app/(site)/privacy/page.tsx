import { POLICY_VERSIONS } from "@bayana/shared";
import { LegalPage, legalMetadata, type LegalSection } from "@/components/legal/legal-page";
import { businessDetails as business } from "@/lib/business-details";

export const metadata = legalMetadata("Privacy policy", "How Bayana collects, uses, shares and protects personal data, and your rights under the Digital Personal Data Protection Act, 2023.");

const sections: LegalSection[] = [
  { heading: "Who is responsible for your data", body: [
    `${business.legalName} is the data fiduciary for the personal data Bayana collects to run the platform, under the Digital Personal Data Protection Act, 2023 (the "DPDP Act"). This policy explains what we collect, why, who we share it with, how long we keep it and what rights you have.`,
    "Vendors who take bookings through Bayana also receive their customers' booking details, and they decide how to use them to provide their service. For that use, the vendor is responsible for the data and must follow the law and the vendor agreement."
  ] },
  { heading: "What we collect and why", body: [
    "We collect only what Bayana needs to work:",
    { list: [
      "Account details (vendors): email address; a password only if you set one (stored as a one-way hash, never readable); if you sign in with Google, your Google account's email and its permanent identifier. We do not receive or keep your Google password or Google access tokens. Used to create and secure your account.",
      "Business details (vendors): business name, page address, city, description, services, prices, hours, terms and policies, and contact details you choose to publish. Used to run your booking page.",
      "Booking details (customers): name, email (verified with a one-time code), phone number where the vendor asks for it, notes you add, and the service and time you book. Used to make, manage and remind you about the booking, and shared with that vendor.",
      "Agreement records: the exact terms you agreed to, with the time, your verified email, IP address and device (browser) details. Used as evidence of what was agreed, for both sides.",
      "Payment records: amount, currency, status, method type (for example \"card\" or \"UPI\") and Razorpay's references. Never card numbers, CVV, UPI PINs or bank passwords: those are entered on Razorpay's checkout and never reach us.",
      "Consent records: which policy version you agreed to and when.",
      "Security records: sign-in times, IP address and device details for sessions, one-time codes (stored only as a keyed hash), and an audit trail of administrative actions. Used to keep accounts safe and to investigate misuse.",
      "Messages: emails we send you (for example codes, confirmations and reminders), and anything you send to our support address."
    ] },
    "We do not use your data for advertising, we do not sell it, and we do not build profiles of you."
  ] },
  { heading: "Our lawful basis and your consent", body: [
    "We process personal data on the basis of your consent, given when you create an account or agree to a booking, and for the legitimate uses the DPDP Act allows: for example, to comply with law (such as keeping tax records), to respond to a legal order, or in an emergency.",
    "When you consent, we record the version of this policy and the time. You can withdraw consent at any time (section 8). Withdrawing does not affect processing that happened before, and we may still keep data the law requires us to keep. Without the data needed to run a booking we cannot provide that booking."
  ] },
  { heading: "Who we share it with", body: [
    "We share personal data only as needed to run Bayana, with:",
    { list: [
      "The vendor you book with: your name, email, phone (if they ask for it), notes and the booking. Vendors see their own customers only.",
      "Neon (Neon Inc.): hosts our database.",
      "Render (Render Services, Inc.): runs our application server.",
      "Vercel (Vercel Inc.): hosts and delivers our website.",
      "Brevo (Sendinblue SAS): sends our emails, so it receives your email address and the email's content.",
      "Razorpay (Razorpay Software Private Limited): processes payments. It receives the payment amount and booking reference and your email (filled in on its checkout), plus whatever you enter on its checkout, such as your phone number and payment details, under Razorpay's own privacy policy.",
      "Google (Google LLC): only if you choose \"Continue with Google\", to confirm your identity.",
      "Authorities: where the law requires it, for example a valid court order or a request from a government agency allowed by law."
    ] },
    "These providers process data on our instructions and under contracts that require them to protect it. We do not allow them to use it for their own purposes."
  ] },
  { heading: "Where your data is stored", body: [
    "Our database and application server run in Singapore (Neon and Render, Asia Pacific region). Our website is delivered from Vercel's global network. Brevo processes email in the European Union. Google processes sign-in in the United States and elsewhere. Razorpay processes payments in India.",
    "So some personal data is processed outside India. The DPDP Act allows this except to countries the Government of India restricts by notification; we will stop any transfer that becomes restricted. Each provider is bound by contract to protect the data wherever it is processed."
  ] },
  { heading: "How long we keep it", body: [
    { list: [
      "One-time sign-in codes: deleted within one day; the text of a code email is removed as soon as it is sent.",
      "Sessions (sign-ins): up to 90 days, then deleted 30 days after they end or are signed out.",
      "Email content we sent: removed after 90 days (the record that an email was sent stays).",
      "Payment notifications from Razorpay: trimmed to the event type after 90 days.",
      "Accounts, business pages and bookings: while your account is open, and then as below.",
      "Payment, refund and ledger records, and the agreed booking terms: kept for as long as Indian tax and company law requires (currently up to 8 years), because they are financial and legal records. When you ask us to erase your data, we remove your name, email, phone and notes from them and keep only the amounts, dates and references."
    ] }
  ] },
  { heading: "Your rights", body: [
    "Under the DPDP Act you can:",
    { list: [
      "Access: ask for a summary of the personal data we hold about you and how we use it. Customers can download their booking data from \"My bookings\"; vendors can export their data from Settings.",
      "Correct and update: fix inaccurate or incomplete data. Vendors can edit their details in the dashboard; anyone can ask us.",
      "Erase: ask us to delete your data. Customers can do this from \"My bookings\"; vendors can close their account in Settings once no bookings are upcoming. We keep only what the law requires, with personal fields removed (section 6).",
      "Withdraw consent: at any time, the same way.",
      "Nominate: name a person to exercise these rights for you if you die or become unable to.",
      "Complain: to our grievance officer (section 11) and, if you are not satisfied, to the Data Protection Board of India."
    ] },
    "We answer requests within 30 days and may need to confirm your identity first (normally by a one-time code to your email)."
  ] },
  { heading: "Children", body: [
    "Bayana is not meant for children. Vendor accounts are for people aged 18 or over. A booking for someone under 18 must be made by a parent or guardian, who gives consent on the child's behalf. We do not track children or show them advertising. If you believe a child has given us data without that consent, contact the grievance officer and we will delete it."
  ] },
  { heading: "Security", body: [
    "We use encryption in transit (HTTPS) everywhere and encrypted storage at our providers. Passwords are hashed with Argon2id, sign-in codes and session tokens are stored only as keyed hashes, and administrator access needs a second factor. Our logs automatically remove cookies, passwords, codes, tokens and keys.",
    "No system is perfectly secure. If you think your account or data has been misused, contact us at once."
  ] },
  { heading: "Cookies", body: [
    "We use one essential cookie: the session cookie that keeps a signed-in vendor signed in. It cannot be read by page scripts and is not used for tracking. While you sign in with Google, a short-lived cookie (10 minutes) protects that sign-in from tampering.",
    "We do not use advertising or analytics cookies. If we ever add analytics, we will update this policy and ask for consent where the law requires it."
  ] },
  { heading: "Grievance officer", body: [
    `Grievance officer: ${business.grievanceOfficer.name}. Email: ${business.grievanceOfficer.email}. Post: ${business.legalName}, ${business.address}.`,
    "We acknowledge a grievance within 48 hours and resolve it within 30 days of receiving it, as the law requires."
  ] },
  { heading: "Personal data breaches", body: [
    "If a breach affects your personal data, we will contain it, investigate, and inform you and the Data Protection Board of India as the DPDP Act and its rules require, explaining what happened, what data was involved, what we have done and what you can do. We also report cybersecurity incidents to CERT-In within the time it requires."
  ] },
  { heading: "Changes to this policy", body: [
    "We show this policy's version and effective date at the top of the page. If we change it in a way that affects how we use your data, we tell signed-in vendors by email or in the dashboard before it takes effect, and we ask for fresh consent where the law requires it. Each consent we record names the version that was in force."
  ] }
];

export default function Privacy() {
  return <LegalPage title="Privacy policy" version={POLICY_VERSIONS.privacy_policy} intro="This policy explains how Bayana handles the personal data of vendors who take bookings and of customers who book them, in line with India's Digital Personal Data Protection Act, 2023." sections={sections} />;
}
