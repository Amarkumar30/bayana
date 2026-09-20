import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import bookingRoutes, { razorpayWebhook } from './routes/bookings.js';
const authLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'Too many attempts; please try again later.' } });
const bookingLimiter = rateLimit({ windowMs: 15 * 60e3, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'Too many booking attempts; please try again later.' } });
export function createApp() {
  const app = express(); app.disable('x-powered-by'); app.use(pinoHttp({ logger })); app.post('/api/v1/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '32kb' }), razorpayWebhook); app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true })); app.use(express.json({ limit: '32kb' })); app.use(cookieParser());
  if (config.NODE_ENV !== 'production') app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(parse(readFileSync(new URL('../../docs/swagger.yaml', import.meta.url), 'utf8'))));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/auth', authLimiter, authRoutes); app.use('/api/v1/public', bookingLimiter); app.use('/api/v1', bookingRoutes); app.use(errorHandler); return app;
}
