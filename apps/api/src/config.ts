import "dotenv/config";
import { z } from "zod";
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"), PORT: z.coerce.number().default(4000), WEB_ORIGIN: z.string().url().default("http://localhost:3000"), DATABASE_URL: z.string().min(1), HOLD_MINUTES: z.coerce.number().int().min(1).default(15), MIN_ADVANCE_PAISE: z.coerce.number().int().positive().default(10000),
  PAYMENT_MODE: z.enum(["disabled", "razorpay"]).default("disabled"), RAZORPAY_KEY_ID: optional(z.string().min(1)), RAZORPAY_KEY_SECRET: optional(z.string().min(1)), RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16)),
  SMTP_URL: optional(z.string().url()), EMAIL_FROM: optional(z.string().email()), SESSION_SECRET: z.string().min(32)
});
export const config = schema.parse(process.env);
if (config.NODE_ENV === "production" && (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !config.RAZORPAY_WEBHOOK_SECRET || !config.SMTP_URL || !config.EMAIL_FROM)) throw new Error("Production requires Razorpay and SMTP configuration");
