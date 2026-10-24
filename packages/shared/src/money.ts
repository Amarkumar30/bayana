export type AdvanceType = "NONE" | "PERCENT" | "FIXED";

/** Exact rupee-string parsing into integer paise ("12.3" -> 1230). Never goes through a float. */
export const paiseFromRupees = (input: string): number => { if (!/^\d+(\.\d{1,2})?$/.test(input)) throw new Error("Invalid rupee amount"); const [whole, fraction = ""] = input.split("."); return Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); };
export const rupeesFromPaise = (paise: number) => (paise / 100).toFixed(2);
/** Percentage advance uses integer round-half-up arithmetic: floor((paise * percent + 50) / 100). */
export const percentageOf = (paise: number, percent: number) => Math.floor((paise * percent + 50) / 100);

/** The advance for a price under a rule; throws when the rule is invalid or the advance would exceed the price. */
export const advancePaise = (totalPaise: number, type: AdvanceType, value: number): number => {
  const amount = type === "NONE" ? 0 : type === "PERCENT" ? percentageOf(totalPaise, value) : value;
  if (!Number.isInteger(totalPaise) || totalPaise < 0 || !Number.isInteger(value) || amount < 0 || amount > totalPaise) throw new Error("Invalid advance rule");
  return amount;
};
/** Why an advance rule is invalid for a price, or null. Used by schemas and forms so the message is the same everywhere. */
export function advanceRuleProblem(pricePaise: number, type: AdvanceType, value: number): string | null {
  if (!Number.isInteger(value) || value < 0) return "Use a whole number.";
  if (type === "NONE") return value === 0 ? null : "No advance must have a value of 0.";
  if (type === "PERCENT") return value >= 1 && value <= 100 ? null : "A percentage advance must be between 1 and 100.";
  if (value < 1) return "A fixed advance must be at least ₹0.01.";
  return value <= pricePaise ? null : "A fixed advance cannot be more than the price.";
}

export const formatINR = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
