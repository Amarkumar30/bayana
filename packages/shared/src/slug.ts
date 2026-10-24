/** Words that collide with app routes, infrastructure or impersonation risk. Never usable as a vendor page address. */
export const RESERVED_SLUGS = new Set([
  "about", "account", "admin", "api", "app", "assets", "auth", "b", "bayana", "billing", "blog", "book", "booking", "bookings", "contact", "dashboard", "design",
  "docs", "forgot", "health", "help", "home", "legal", "login", "logout", "mail", "my", "my-bookings", "new", "onboarding", "payments", "pricing", "privacy",
  "ready", "refunds", "register", "reset", "security", "services", "settings", "signin", "signup", "static", "status", "support", "terms", "vendors", "waking",
  "www", "availability"
]);
/** 3 to 40 characters, a-z 0-9 and single hyphens, starting and ending with a letter or digit. */
export const slugPattern = /^(?=.{3,40}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const normalizeSlug = (slug: string) => slug.trim().toLowerCase();
export function slugProblem(slug: string): string | null {
  if (slug !== normalizeSlug(slug)) return "Use lowercase letters only.";
  if (slug.length < 3 || slug.length > 40) return "Use 3 to 40 characters.";
  if (!slugPattern.test(slug)) return "Use letters, numbers and single hyphens, starting and ending with a letter or number.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Try another.";
  return null;
}
export const isValidSlug = (slug: string) => slugProblem(slug) === null;
/** A suggested address from a business name: "Studio Sunday!" -> "studio-sunday". May still be taken or reserved. */
export const suggestSlug = (name: string) => normalizeSlug(name).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
