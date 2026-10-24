/** The only variables a vendor's terms template may use. Rendering is plain text; nothing else is evaluated. */
export const TERMS_VARIABLES = {
  business_name: "Your business name",
  service_name: "The service booked",
  price: "Total price, e.g. ₹8,000.00",
  advance: "Advance paid to confirm",
  balance: "Balance due later",
  date: "Booking date in your timezone",
  time: "Start time in your timezone",
  customer_name: "Customer's name",
  cancellation_policy: "The service's cancellation tiers, in words"
} as const;
export type TermsVariable = keyof typeof TERMS_VARIABLES;
const token = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Unknown variables and stray braces are errors, so a typo can never reach a customer as "{{prise}}". */
export function termsTemplateProblems(template: string): string[] {
  const problems: string[] = [];
  for (const match of template.matchAll(token)) if (!(match[1] in TERMS_VARIABLES)) problems.push(match[1] ? `Unknown variable {{${match[1]}}}. Use one of: ${Object.keys(TERMS_VARIABLES).join(", ")}.` : "Empty {{ }} found.");
  const leftover = template.replace(token, "");
  if (leftover.includes("{{") || leftover.includes("}}")) problems.push("Unmatched {{ or }} found.");
  return [...new Set(problems)];
}
export function renderTerms(template: string, values: Record<TermsVariable, string>) {
  if (termsTemplateProblems(template).length) throw new Error("Invalid terms template");
  return template.replace(token, (_whole, name: TermsVariable) => values[name]);
}
