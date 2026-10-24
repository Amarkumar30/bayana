import { z } from "zod";

const origin = z.string().url().refine(value => new URL(value).origin === value);
// The Razorpay key id is public by design (Checkout needs it); the key secret never reaches the web app. Live ids are refused in this build.
const razorpayKeyId = z.preprocess(value => value === "" ? undefined : value, z.string().regex(/^rzp_test_[A-Za-z0-9]+$/).optional());
const schema = z.object({ NEXT_PUBLIC_API_URL: origin, NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_RAZORPAY_KEY_ID: razorpayKeyId });
const allowed: Record<keyof z.infer<typeof schema>, string> = {
  NEXT_PUBLIC_API_URL: "the API origin with no path or trailing slash, e.g. http://localhost:4000",
  NEXT_PUBLIC_SITE_URL: "this site's origin with no path or trailing slash, e.g. http://localhost:3000",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "empty, or your Razorpay test key id (rzp_test_...); never the key secret"
};

/** Names each problem with the accepted format and the file to edit. Rejected values are never echoed (public, but kept consistent with the API). */
export function webEnvProblems(input: Record<string, string | undefined>) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return [];
  const names = [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))] as (keyof typeof allowed)[];
  return names.map(name => ({ name, rule: `${input[name] ? "must be" : "is missing; set it to"} ${allowed[name]}` }));
}
export function loadWebEnv(input: Record<string, string | undefined> = { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID }, envFile = "apps/web/.env.local") {
  const problems = webEnvProblems(input);
  if (!problems.length) return schema.parse(input);
  throw new Error([`Invalid web environment. Edit ${envFile} (compare with apps/web/.env.example):`, ...problems.map(problem => `  - ${problem.name}: ${problem.rule}`)].join("\n"));
}
