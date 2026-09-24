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
import vendorRoutes from './routes/vendors.js';
import clientRoutes from './routes/clients.js';
import proposalRoutes from './routes/proposals.js';
import contractRoutes from './routes/contracts.js';
import invoiceRoutes from './routes/invoices.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many attempts; please try again later.' },
});
const bookingLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many booking attempts; please try again later.' },
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));

  // Webhook must receive raw body before JSON middleware
  app.post(
    '/api/v1/payments/razorpay/webhook',
    express.raw({ type: 'application/json', limit: '32kb' }),
    razorpayWebhook,
  );

  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  if (config.NODE_ENV !== 'production') {
    try {
      const swaggerDoc = parse(readFileSync(new URL('../../docs/swagger.yaml', import.meta.url), 'utf8'));
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
    } catch {
      logger.warn('swagger.yaml not found – Swagger UI disabled');
    }
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Auth
  app.use('/api/v1/auth', authLimiter, authRoutes);

  // Public booking routes (existing)
  app.use('/api/v1', bookingLimiter, bookingRoutes);

  // Vendor profile + dashboard
  app.use('/api/v1', vendorRoutes);

  // Client management
  app.use('/api/v1', clientRoutes);

  // Proposals (includes public portal routes)
  app.use('/api/v1', proposalRoutes);

  // Contracts (includes public portal routes)
  app.use('/api/v1', contractRoutes);

  // Invoices (includes public portal routes)
  app.use('/api/v1', invoiceRoutes);

  app.use(errorHandler);
  return app;
}
