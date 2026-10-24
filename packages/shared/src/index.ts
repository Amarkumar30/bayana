export const RESERVED_SLUGS = new Set(["api", "admin", "auth", "login", "signup", "dashboard", "booking", "bookings", "my", "my-bookings", "terms", "privacy", "help", "support", "about", "pricing", "static", "bayana", "vendors", "services", "availability", "payments", "health", "ready"]);
export const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const normalizeSlug = (slug: string) => slug.trim().toLowerCase();
export const isValidSlug = (slug: string) => slug === normalizeSlug(slug) && slugPattern.test(slug) && !RESERVED_SLUGS.has(slug);
export const paiseFromRupees = (input: string): number => { if (!/^\d+(\.\d{1,2})?$/.test(input)) throw new Error("Invalid rupee amount"); const [whole, fraction = ""] = input.split("."); return Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); };
export const advancePaise = (totalPaise: number, type: "NONE" | "PERCENT" | "FIXED", value: number): number => {
  const amount = type === "NONE" ? 0 : type === "PERCENT" ? percentageOf(totalPaise, value) : value;
  if (!Number.isInteger(totalPaise) || totalPaise < 0 || !Number.isInteger(value) || amount < 0 || amount > totalPaise) throw new Error("Invalid advance rule");
  return amount;
};
export type PublishChecklistInput = { slug: string | null; hasService: boolean; hasValidAdvanceRule: boolean; hasAvailability: boolean; hasFullDay: boolean; businessName: string; description: string; terms: string; cancellationPolicy: string; reschedulingPolicy: string };
export const missingPublishRequirements = (value: PublishChecklistInput): string[] => [
  !value.slug && "slug",
  !value.hasService && "active_service",
  !(value.terms && value.cancellationPolicy && value.reschedulingPolicy) && "policies",
  !value.hasValidAdvanceRule && "valid_advance_rules",
  !(value.hasAvailability || value.hasFullDay) && "availability",
  !value.businessName && "business_name",
  !value.description && "description"
].filter((item): item is string => Boolean(item));
export const formatINR = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
/** Percentage advance uses integer round-half-up arithmetic. */
export const percentageOf = (paise: number, percent: number) => Math.floor((paise * percent + 50) / 100);
