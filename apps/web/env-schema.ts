import { z } from "zod";

const origin = z.string().url().refine(value => new URL(value).origin === value);
// The Razorpay key id is public by design (Checkout needs it); the key secret never reaches the web app. Live ids are refused in this build.
const razorpayKeyId = z.preprocess(value => value === "" ? undefined : value, z.string().regex(/^rzp_test_[A-Za-z0-9]+$/).optional());
const optionalUrl = z.preprocess(value => value === "" ? undefined : value, z.string().url().optional());
const schema = z.object({ NEXT_PUBLIC_API_URL: origin, NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_RAZORPAY_KEY_ID: razorpayKeyId, NEXT_PUBLIC_SENTRY_DSN: optionalUrl });
const allowed: Record<keyof z.infer<typeof schema>, string> = {
  NEXT_PUBLIC_API_URL: "the API origin with no path or trailing slash, e.g. http://localhost:4000",
  NEXT_PUBLIC_SITE_URL: "this site's origin with no path or trailing slash, e.g. http://localhost:3000",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "empty, or your Razorpay test key id (rzp_test_...); never the key secret",
  NEXT_PUBLIC_SENTRY_DSN: "empty, or the Sentry DSN URL (only its ingest host is allowed by the CSP)"
};

/** Names each problem with the accepted format and the file to edit. Rejected values are never echoed (public, but kept consistent with the API). */
export function webEnvProblems(input: Record<string, string | undefined>) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return [];
  const names = [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))] as (keyof typeof allowed)[];
  return names.map(name => ({ name, rule: `${input[name] ? "must be" : "is missing; set it to"} ${allowed[name]}` }));
}
/**
 * Server-only settings: never NEXT_PUBLIC_, so Next never inlines them into the browser bundle. SESSION_COOKIE_NAME must match
 * the API's (apps/api/src/config-schema.ts, same rule): bayana_session by default, bayana_staging_session on staging.
 */
const serverSchema = z.object({ SESSION_COOKIE_NAME: z.preprocess(value => value === "" ? undefined : value, z.string().regex(/^[A-Za-z0-9_]{1,64}$/).default("bayana_session")) });
export function loadServerEnv(input: Record<string, string | undefined> = { SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME }, envFile = "apps/web/.env.local") {
  const parsed = serverSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid web environment. Edit ${envFile} (compare with apps/web/.env.example):\n  - SESSION_COOKIE_NAME: must be empty (bayana_session), or letters, digits and _ only, matching the API`);
}
export function loadWebEnv(input: Record<string, string | undefined> = { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN }, envFile = "apps/web/.env.local") {
  const problems = webEnvProblems(input);
  if (!problems.length) return schema.parse(input);
  throw new Error([`Invalid web environment. Edit ${envFile} (compare with apps/web/.env.example):`, ...problems.map(problem => `  - ${problem.name}: ${problem.rule}`)].join("\n"));
}
