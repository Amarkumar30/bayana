import { z } from "zod";

const origin = z.string().url().refine(value => new URL(value).origin === value, "Use an origin with no path or trailing slash");
const schema = z.object({ NEXT_PUBLIC_API_URL: origin, NEXT_PUBLIC_SITE_URL: origin });

// Next.js inlines NEXT_PUBLIC_* only for literal `process.env.NAME` reads, so each name is read explicitly.
export function loadWebEnv(input: Record<string, string | undefined> = { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid web environment: ${[...new Set(parsed.error.issues.map(issue => issue.path.join(".")))].join(", ")}`);
  return parsed.data;
}
