// The one place the legal pages, footer and contact page get the operator's identity from. No imports, so next.config.ts and
// `node --test` can load it directly. Every value in [SQUARE BRACKETS AND CAPITALS] is a placeholder: a production build
// (NODE_ENV=production with APP_ENV=production) refuses to finish while any remain. Staging and local builds may show them.

export const businessDetails = {
  /** The registered name of the company, LLP or proprietor that contracts with users and receives money. */
  legalName: "[LEGAL BUSINESS NAME]",
  /** The brand users see. */
  tradingName: "Bayana",
  /** For example "private limited company", "limited liability partnership" or "sole proprietorship". */
  entityType: "[ENTITY TYPE]",
  /** Registered office, as on the registration certificate. */
  address: "[REGISTERED ADDRESS, CITY, STATE, PIN CODE]",
  phone: "[SUPPORT PHONE NUMBER]",
  supportEmail: "hello@bayana.in",
  /** When support answers, and how fast. Shown on /contact; these are promises, so set them deliberately. */
  supportHours: "[SUPPORT HOURS, E.G. MONDAY TO SATURDAY, 10:00 TO 18:00 IST]",
  responseTime: "[RESPONSE TIME, E.G. WITHIN 2 WORKING DAYS]",
  /** DPDP Act 2023 grievance contact. Must be a named person (or the designated officer) who actually reads the mailbox. */
  grievanceOfficer: { name: "[GRIEVANCE OFFICER NAME]", email: "grievance@bayana.in" },
  /** Leave null until GST registration is granted; then set the 15-character GSTIN. */
  gstin: null as string | null,
  /** The date the current versions of the policies take effect, for example "1 December 2026". */
  effectiveDate: "[EFFECTIVE DATE]",
  /** Courts named in the terms. */
  jurisdictionCity: "New Delhi",
  /** Current prices (SPEC 20.1). Placeholders until decided; the pricing page shows them as current prices. */
  pricing: {
    proMonthlyInr: "[PRO PLAN PRICE PER MONTH, INR]",
    freePlatformFeePercent: "[PLATFORM FEE % ON FREE PLAN]",
    proPlatformFeePercent: "[PLATFORM FEE % ON PRO PLAN]"
  }
};

export type BusinessDetails = typeof businessDetails;

/** "[LEGAL BUSINESS NAME]"-style markers: an opening bracket, then capitals, digits and punctuation, then a closing bracket. */
const placeholder = /\[[A-Z][A-Z0-9 ,.:%&/()-]*\]/;

/** Every field path whose value still contains a placeholder, for example ["legalName", "grievanceOfficer.name"]. */
export function businessDetailsPlaceholders(details: unknown, path = ""): string[] {
  if (typeof details === "string") return placeholder.test(details) ? [path] : [];
  if (details && typeof details === "object") return Object.entries(details).flatMap(([key, value]) => businessDetailsPlaceholders(value, path ? `${path}.${key}` : key));
  return [];
}

/** Fails the production build (and only it) while placeholders remain. Names fields, never values. */
export function assertBusinessDetailsReady(input: { nodeEnv: string | undefined; appEnv: string | undefined }, details: unknown = businessDetails) {
  if (input.nodeEnv !== "production" || input.appEnv !== "production") return;
  const missing = businessDetailsPlaceholders(details);
  if (missing.length) throw new Error(`Production build refused: apps/web/lib/business-details.ts still has placeholders in ${missing.join(", ")}. Fill them in (legal pages, footer and contact page use them).`);
}
