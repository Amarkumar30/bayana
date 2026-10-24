import { z } from "zod";

// Pure environment rules: no dotenv, no process exit. config.ts applies them to process.env; scripts apply them to a parsed file.
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const origins = z.string().transform(value => value.split(",").map(origin => origin.trim()).filter(Boolean)).pipe(z.array(z.string().url().refine(origin => new URL(origin).origin === origin)).min(1));
const shape = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"), APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000), TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  WEB_ORIGINS: optional(origins), WEB_ORIGIN: optional(origins), SESSION_COOKIE_DOMAIN: optional(z.string().min(1)),
  DATABASE_URL: optional(z.string().url()), DATABASE_URL_DIRECT: optional(z.string().url()), DATABASE_URL_TEST: optional(z.string().url()),
  HOLD_MINUTES: z.coerce.number().int().min(1).default(15), REQUEST_HOLD_HOURS: z.coerce.number().int().min(1).max(168).default(48), MIN_ADVANCE_PAISE: z.coerce.number().int().positive().default(10000),
  PAYMENT_MODE: z.enum(["disabled", "test", "live"]).default("disabled"), LIVE_PAYMENTS_ACK: optional(z.literal("yes")), RAZORPAY_KEY_ID: optional(z.string().min(1)), RAZORPAY_KEY_SECRET: optional(z.string().min(1)), RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16)), PAYMENT_PROVIDER: z.enum(["razorpay", "fake"]).default("razorpay"),
  EMAIL_TRANSPORT: optional(z.enum(["smtp", "log", "capture"])), SMTP_URL: optional(z.string().url()), EMAIL_FROM: optional(z.string().min(3)),
  SESSION_SECRET: z.string().min(32), OTP_PEPPER: optional(z.string().min(16)),
  TICK_SECRET: optional(z.string().min(32)), OPS_EMAIL: optional(z.string().email()),
  GOOGLE_CLIENT_ID: optional(z.string().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/)), GOOGLE_CLIENT_SECRET: optional(z.string().min(8)), GOOGLE_REDIRECT_URI: optional(z.string().url().refine(url => /\/v1\/auth\/google\/callback$/.test(new URL(url).pathname)))
};
type Shape = typeof shape;
type Parsed = { [K in keyof Shape]: z.infer<Shape[K]> };
export type EmailTransport = "smtp" | "log" | "capture";
export type Config = Omit<Parsed, "WEB_ORIGIN" | "WEB_ORIGINS" | "DATABASE_URL" | "DATABASE_URL_DIRECT" | "EMAIL_TRANSPORT"> & { EMAIL_TRANSPORT: EmailTransport; WEB_ORIGINS: string[]; DATABASE_URL: string; DATABASE_URL_DIRECT: string; OTP_PEPPER: string };

/** What each variable accepts, in words. Shown instead of the (possibly secret) value that was rejected. */
export const allowedValues: Record<keyof Shape, string> = {
  NODE_ENV: "one of development, test, production", APP_ENV: "one of local, staging, production", PORT: "a port number from 1 to 65535 (4000 locally)", TRUST_PROXY: "a whole number of proxy hops from 0 to 10 (0 locally, 1 on Render)",
  WEB_ORIGINS: "comma-separated exact origins with no path or trailing slash, e.g. http://localhost:3000", WEB_ORIGIN: "an origin like http://localhost:3000 (old name; use WEB_ORIGINS)", SESSION_COOKIE_DOMAIN: "empty locally, or a domain like .bayana.in",
  DATABASE_URL: "a postgres:// URL, e.g. postgres://bayana:bayana@localhost:5433/bayana_dev", DATABASE_URL_DIRECT: "a postgres:// URL for migrations (may be empty outside production)", DATABASE_URL_TEST: "a postgres:// URL whose database name ends in _test, e.g. .../bayana_test",
  HOLD_MINUTES: "a whole number of minutes, at least 1", REQUEST_HOLD_HOURS: "a whole number of hours from 1 to 168", MIN_ADVANCE_PAISE: "a positive whole number of paise",
  PAYMENT_MODE: "one of disabled, test, live (use disabled locally)", LIVE_PAYMENTS_ACK: "empty, or yes (production with live payments only)", RAZORPAY_KEY_ID: "an rzp_test_ key id with PAYMENT_MODE=test (may stay set, unused, while disabled); rzp_live_ only with PAYMENT_MODE=live",
  RAZORPAY_KEY_SECRET: "the key secret paired with RAZORPAY_KEY_ID (required when PAYMENT_MODE=test or live)", RAZORPAY_WEBHOOK_SECRET: "the secret you chose for the Razorpay webhook, at least 16 characters (optional in test mode until the webhook exists)", PAYMENT_PROVIDER: "razorpay, or fake (NODE_ENV=test only, used by automated tests)",
  EMAIL_TRANSPORT: "one of smtp, log (development only), capture (test only); defaults to capture when NODE_ENV=test, otherwise smtp", SMTP_URL: "an smtp:// URL, e.g. smtp://localhost:1025 for Mailpit", EMAIL_FROM: "a sender like Bayana <hello@bayana.in>",
  SESSION_SECRET: "a random value of at least 32 characters (pnpm.cmd setup:env generates one)", OTP_PEPPER: "a random value of at least 16 characters (required in production)",
  TICK_SECRET: "a random value of at least 32 characters that the scheduled job runner sends (required in production; pnpm.cmd setup:env generates one)", OPS_EMAIL: "empty, or the address that receives payment and consistency reviews",
  GOOGLE_CLIENT_ID: "empty (Google sign-in off), or the OAuth client id ending in .apps.googleusercontent.com (docs/GOOGLE_SETUP.md)", GOOGLE_CLIENT_SECRET: "the OAuth client secret paired with GOOGLE_CLIENT_ID",
  GOOGLE_REDIRECT_URI: "the API callback URL registered in Google, e.g. http://localhost:4000/v1/auth/google/callback"
};

export type EnvProblem = { name: string; rule: string };
export class ConfigError extends Error {
  constructor(readonly problems: EnvProblem[], readonly envFile: string) {
    super([`Invalid environment. Edit ${envFile} (compare with ${envFile.replace(/\.env(\.local)?$/, ".env.example")}):`, ...problems.map(problem => `  - ${problem.name}: ${problem.rule}`)].join("\n"));
    this.name = "ConfigError";
  }
}

/** Database names must say which environment they belong to, so a development command can never touch test or production data. */
export function databaseNameProblem(url: string, nodeEnv: Parsed["NODE_ENV"]): string | null {
  let name: string;
  try { name = decodeURIComponent(new URL(url).pathname.slice(1)); } catch { return "is not a valid postgres:// URL"; }
  if (nodeEnv === "test" && !name.endsWith("_test")) return "must name a database ending in _test when NODE_ENV=test";
  if (nodeEnv === "development" && !name.endsWith("_dev")) return "must name a database ending in _dev when NODE_ENV=development (for example bayana_dev)";
  if (nodeEnv === "production" && (name.endsWith("_dev") || name.endsWith("_test"))) return "must not name a _dev or _test database when NODE_ENV=production";
  return null;
}

/** Validates every variable and reports all problems at once, by name and rule only; rejected values are never included. */
export function loadConfig(input: NodeJS.ProcessEnv = process.env, envFile = "apps/api/.env"): Config {
  const problems: EnvProblem[] = []; const value = {} as Record<string, unknown>;
  for (const [name, schema] of Object.entries(shape) as [keyof Shape, z.ZodTypeAny][]) {
    const result = schema.safeParse(input[name]);
    if (result.success) value[name] = result.data;
    else problems.push({ name, rule: input[name] === undefined || input[name] === "" ? `is missing; set it to ${allowedValues[name]}` : `must be ${allowedValues[name]}` });
  }
  const v = value as Partial<Parsed>; const problem = (name: string, rule: string) => problems.push({ name, rule });
  const production = v.NODE_ENV === "production";
  // WEB_ORIGIN is the pre-Phase-1 name; it is accepted outside production until local .env files are migrated.
  const webOrigins = v.WEB_ORIGINS ?? (production ? undefined : v.WEB_ORIGIN);
  if (!webOrigins && !problems.some(item => item.name === "WEB_ORIGINS" || item.name === "WEB_ORIGIN")) problem("WEB_ORIGINS", `is missing; set it to ${allowedValues.WEB_ORIGINS}`);
  const databaseName = v.NODE_ENV === "test" ? "DATABASE_URL_TEST" : "DATABASE_URL";
  const databaseUrl = v.NODE_ENV === "test" ? v.DATABASE_URL_TEST : v.DATABASE_URL;
  if (!databaseUrl && !problems.some(item => item.name === databaseName)) problem(databaseName, `is missing; set it to ${allowedValues[databaseName]}`);
  if (databaseUrl && v.NODE_ENV === "test" && !new URL(databaseUrl).pathname.endsWith("_test")) problem("DATABASE_URL_TEST", "must name a database ending in _test");
  if (databaseUrl && v.NODE_ENV !== "test" && new URL(databaseUrl).pathname.endsWith("_test")) problem("DATABASE_URL", "must not name a _test database outside NODE_ENV=test");
  if (production && !v.DATABASE_URL_DIRECT) problem("DATABASE_URL_DIRECT", "is required in production");
  if (production && !v.OTP_PEPPER) problem("OTP_PEPPER", "is required in production");
  if (production && !v.TICK_SECRET) problem("TICK_SECRET", "is required in production (scheduled jobs call /internal/jobs with it)");
  // Tests keep email in memory unless a run opts into SMTP explicitly (the live browser suite reads codes from Mailpit).
  const transport: EmailTransport = v.EMAIL_TRANSPORT ?? (v.NODE_ENV === "test" ? "capture" : "smtp");
  if (transport === "smtp") { if (!v.SMTP_URL) problem("SMTP_URL", `is required when EMAIL_TRANSPORT=smtp; set it to ${allowedValues.SMTP_URL}`); if (!v.EMAIL_FROM) problem("EMAIL_FROM", `is required when EMAIL_TRANSPORT=smtp; set it to ${allowedValues.EMAIL_FROM}`); }
  if (transport === "log" && v.NODE_ENV !== "development") problem("EMAIL_TRANSPORT", "may be log only when NODE_ENV=development");
  if (transport === "capture" && v.NODE_ENV !== "test") problem("EMAIL_TRANSPORT", "may be capture only when NODE_ENV=test");
  const razorpay = { RAZORPAY_KEY_ID: v.RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET: v.RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: v.RAZORPAY_WEBHOOK_SECRET };
  // Keys may stay in the file, unused, while payments are disabled; a key of the wrong kind for the mode always aborts (PY-01).
  const required = v.PAYMENT_MODE === "live" ? Object.keys(razorpay) : v.PAYMENT_MODE === "test" ? ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] : [];
  for (const name of required) if (!razorpay[name as keyof typeof razorpay]) problem(name, `is required when PAYMENT_MODE=${v.PAYMENT_MODE}`);
  const keyId = v.RAZORPAY_KEY_ID;
  if (keyId && !keyId.startsWith("rzp_test_") && !keyId.startsWith("rzp_live_")) problem("RAZORPAY_KEY_ID", "must start with rzp_test_ or rzp_live_");
  if (keyId?.startsWith("rzp_live_") && v.PAYMENT_MODE !== "live") problem("RAZORPAY_KEY_ID", "is a live key (rzp_live_...); live keys are allowed only with PAYMENT_MODE=live");
  if (keyId?.startsWith("rzp_test_") && v.PAYMENT_MODE === "live") problem("RAZORPAY_KEY_ID", "must be a live key (rzp_live_...) when PAYMENT_MODE=live");
  if (v.PAYMENT_PROVIDER === "fake" && v.NODE_ENV !== "test") problem("PAYMENT_PROVIDER", "may be fake only when NODE_ENV=test");
  if (v.PAYMENT_MODE === "live" && (!production || v.LIVE_PAYMENTS_ACK !== "yes")) problem("PAYMENT_MODE", "may be live only with NODE_ENV=production and LIVE_PAYMENTS_ACK=yes");
  // Google sign-in is optional: without a client id it is simply off. With one, the secret and callback URL must be set too.
  if (v.GOOGLE_CLIENT_ID) for (const name of ["GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"] as const) if (!v[name]) problem(name, `is required when GOOGLE_CLIENT_ID is set; set it to ${allowedValues[name]}`);
  if (problems.length || !webOrigins || !databaseUrl) throw new ConfigError(problems, envFile);
  const { WEB_ORIGIN: _legacyOrigin, WEB_ORIGINS: _origins, DATABASE_URL: _database, DATABASE_URL_DIRECT: direct, ...rest } = v as Parsed;
  return { ...rest, EMAIL_TRANSPORT: transport, WEB_ORIGINS: webOrigins, DATABASE_URL: databaseUrl, DATABASE_URL_DIRECT: v.NODE_ENV === "test" ? databaseUrl : direct ?? databaseUrl, OTP_PEPPER: v.OTP_PEPPER ?? (v as Parsed).SESSION_SECRET };
}
