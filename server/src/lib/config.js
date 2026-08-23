import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(), JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32), RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1), RAZORPAY_WEBHOOK_SECRET: z.string().min(16), PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173')
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
export const config = parsed.data;
