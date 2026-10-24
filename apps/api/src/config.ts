import "dotenv/config";
import { z } from "zod";

const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000), WEB_ORIGIN: z.string().url().default("http://localhost:3000"), DATABASE_URL: z.string().url(),
  HOLD_MINUTES: z.coerce.number().int().min(1).default(15), REQUEST_HOLD_HOURS: z.coerce.number().int().min(1).max(168).default(48), MIN_ADVANCE_PAISE: z.coerce.number().int().positive().default(10000),
  PAYMENT_MODE: z.enum(["disabled", "test", "live"]).default("disabled"), RAZORPAY_KEY_ID: optional(z.string().min(1)), RAZORPAY_KEY_SECRET: optional(z.string().min(1)), RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16)),
  EMAIL_TRANSPORT: z.enum(["smtp", "log"]).default("smtp"), SMTP_URL: optional(z.string().url()), EMAIL_FROM: optional(z.string().email()),
  SESSION_SECRET: z.string().min(32), OTP_PEPPER: optional(z.string().min(16))
});
export type Config = z.infer<typeof schema> & { OTP_PEPPER: string };
export function loadConfig(input: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  const value = parsed.data, failures: string[] = [];
  if (value.NODE_ENV === "production" && !value.OTP_PEPPER) failures.push("OTP_PEPPER is required in production");
  if (value.EMAIL_TRANSPORT === "smtp" && (!value.SMTP_URL || !value.EMAIL_FROM)) failures.push("SMTP_URL and EMAIL_FROM are required for EMAIL_TRANSPORT=smtp");
  if (value.EMAIL_TRANSPORT === "log" && value.NODE_ENV !== "development") failures.push("EMAIL_TRANSPORT=log is allowed only in development");
  const razorpayValues = [value.RAZORPAY_KEY_ID, value.RAZORPAY_KEY_SECRET, value.RAZORPAY_WEBHOOK_SECRET];
  const configuredCredentials = razorpayValues.filter(Boolean).length;
  if (value.PAYMENT_MODE === "disabled" && configuredCredentials > 0) failures.push("Razorpay credentials require PAYMENT_MODE=test or live");
  if (value.PAYMENT_MODE !== "disabled" && configuredCredentials !== razorpayValues.length) failures.push("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required for payments");
  if (value.RAZORPAY_KEY_ID && value.PAYMENT_MODE === "test" && !value.RAZORPAY_KEY_ID.startsWith("rzp_test_")) failures.push("RAZORPAY_KEY_ID must be a test key for PAYMENT_MODE=test");
  if (value.RAZORPAY_KEY_ID && value.PAYMENT_MODE === "live" && !value.RAZORPAY_KEY_ID.startsWith("rzp_live_")) failures.push("RAZORPAY_KEY_ID must be a live key for PAYMENT_MODE=live");
  if (failures.length) throw new Error(`Invalid environment: ${failures.join(", ")}`);
  return { ...value, OTP_PEPPER: value.OTP_PEPPER ?? value.SESSION_SECRET };
}
export const config = loadConfig();
