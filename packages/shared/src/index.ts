export const RESERVED_SLUGS = new Set(["api", "admin", "login", "signup", "dashboard", "my", "booking", "terms", "privacy", "help", "support", "about", "pricing", "static", "bayana"]);
export const isValidSlug = (slug: string) => /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug);
export const paiseFromRupees = (input: string): number => { if (!/^\d+(\.\d{1,2})?$/.test(input)) throw new Error("Invalid rupee amount"); const [whole, fraction = ""] = input.split("."); return Number(whole) * 100 + Number((fraction + "00").slice(0, 2)); };
export const formatINR = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
export const percentageOf = (paise: number, percent: number) => Math.floor((paise * percent + 50) / 100);
