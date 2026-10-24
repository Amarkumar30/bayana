import "dotenv/config";
import { z } from "zod";

const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const origins = z.string().transform(value => value.split(",").map(origin => origin.trim()).filter(Boolean)).pipe(z.array(z.string().url().refine(origin => new URL(origin).origin === origin, "Origins must not have a path or trailing slash")).min(1));
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"), APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000), TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  WEB_ORIGINS: optional(origins), WEB_ORIGIN: optional(origins), SESSION_COOKIE_DOMAIN: optional(z.string().min(1)),
  DATABASE_URL: optional(z.string().url()), DATABASE_URL_DIRECT: optional(z.string().url()), DATABASE_URL_TEST: optional(z.string().url()),
  HOLD_MINUTES: z.coerce.number().int().min(1).default(15), REQUEST_HOLD_HOURS: z.coerce.number().int().min(1).max(168).default(48), MIN_ADVANCE_PAISE: z.coerce.number().int().positive().default(10000),
  PAYMENT_MODE: z.enum(["disabled", "test", "live"]).default("disabled"), LIVE_PAYMENTS_ACK: optional(z.literal("yes")), RAZORPAY_KEY_ID: optional(z.string().min(1)), RAZORPAY_KEY_SECRET: optional(z.string().min(1)), RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16)),
  EMAIL_TRANSPORT: z.enum(["smtp", "log"]).default("smtp"), SMTP_URL: optional(z.string().url()), EMAIL_FROM: optional(z.string().min(3)),
  SESSION_SECRET: z.string().min(32), OTP_PEPPER: optional(z.string().min(16))
});
type Parsed = z.infer<typeof schema>;
export type Config = Omit<Parsed, "WEB_ORIGIN" | "WEB_ORIGINS" | "DATABASE_URL" | "DATABASE_URL_DIRECT"> & { WEB_ORIGINS: string[]; DATABASE_URL: string; DATABASE_URL_DIRECT: string; OTP_PEPPER: string };
const isTestDatabase = (url: string) => new URL(url).pathname.endsWith("_test");

/** Throws with variable names only; values never appear in the message. */
export function loadConfig(input: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid environment: ${[...new Set(parsed.error.issues.map(issue => issue.path.join(".")))].join(", ")}`);
  const value = parsed.data, failures: string[] = [];
  const production = value.NODE_ENV === "production";
  // WEB_ORIGIN is the pre-Phase-1 name; it is accepted outside production until local .env files are migrated.
  const webOrigins = value.WEB_ORIGINS ?? (production ? undefined : value.WEB_ORIGIN);
  if (!webOrigins) failures.push("WEB_ORIGINS is required");
  const databaseUrl = value.NODE_ENV === "test" ? value.DATABASE_URL_TEST : value.DATABASE_URL;
  if (!databaseUrl) failures.push(value.NODE_ENV === "test" ? "DATABASE_URL_TEST is required when NODE_ENV=test" : "DATABASE_URL is required");
  if (value.NODE_ENV === "test" && databaseUrl && !isTestDatabase(databaseUrl)) failures.push("DATABASE_URL_TEST must name a database ending in _test");
  if (value.NODE_ENV !== "test" && databaseUrl && isTestDatabase(databaseUrl)) failures.push("DATABASE_URL must not name a _test database outside NODE_ENV=test");
  if (production && !value.DATABASE_URL_DIRECT) failures.push("DATABASE_URL_DIRECT is required in production");
  if (production && !value.OTP_PEPPER) failures.push("OTP_PEPPER is required in production");
  if (value.EMAIL_TRANSPORT === "smtp" && value.NODE_ENV !== "test" && (!value.SMTP_URL || !value.EMAIL_FROM)) failures.push("SMTP_URL and EMAIL_FROM are required for EMAIL_TRANSPORT=smtp");
  if (value.EMAIL_TRANSPORT === "log" && value.NODE_ENV !== "development") failures.push("EMAIL_TRANSPORT=log is allowed only in development");
  const razorpayValues = [value.RAZORPAY_KEY_ID, value.RAZORPAY_KEY_SECRET, value.RAZORPAY_WEBHOOK_SECRET];
  const configuredCredentials = razorpayValues.filter(Boolean).length;
  if (value.PAYMENT_MODE === "disabled" && configuredCredentials > 0) failures.push("Razorpay credentials require PAYMENT_MODE=test or live");
  if (value.PAYMENT_MODE !== "disabled" && configuredCredentials !== razorpayValues.length) failures.push("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required for payments");
  if (value.RAZORPAY_KEY_ID && value.PAYMENT_MODE === "test" && !value.RAZORPAY_KEY_ID.startsWith("rzp_test_")) failures.push("RAZORPAY_KEY_ID must be a test key for PAYMENT_MODE=test");
  if (value.RAZORPAY_KEY_ID && value.PAYMENT_MODE === "live" && !value.RAZORPAY_KEY_ID.startsWith("rzp_live_")) failures.push("RAZORPAY_KEY_ID must be a live key for PAYMENT_MODE=live");
  if (value.PAYMENT_MODE === "live" && (!production || value.LIVE_PAYMENTS_ACK !== "yes")) failures.push("PAYMENT_MODE=live requires NODE_ENV=production and LIVE_PAYMENTS_ACK=yes");
  if (failures.length || !webOrigins || !databaseUrl) throw new Error(`Invalid environment: ${failures.join(", ")}`);
  const { WEB_ORIGIN: _legacyOrigin, WEB_ORIGINS: _origins, DATABASE_URL: _database, DATABASE_URL_DIRECT: direct, ...rest } = value;
  return { ...rest, WEB_ORIGINS: webOrigins, DATABASE_URL: databaseUrl, DATABASE_URL_DIRECT: value.NODE_ENV === "test" ? databaseUrl : direct ?? databaseUrl, OTP_PEPPER: value.OTP_PEPPER ?? value.SESSION_SECRET };
}
function loadConfigOrExit(): Config {
  try { return loadConfig(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid environment"}\n`); process.exit(1); }
}
export const config = loadConfigOrExit();
