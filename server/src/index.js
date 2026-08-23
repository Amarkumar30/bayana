import { createApp } from './app.js';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { expireStaleBookings } from './services/bookingService.js';
const app = createApp();
app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'Bayana API listening'));
// Reconciliation is idempotent; each state change is independently guarded in a transaction.
const expiryInterval = setInterval(() => expireStaleBookings().catch((error) => logger.error({ err: error }, 'Booking expiry worker failed')), 60_000);
expiryInterval.unref();
expireStaleBookings().catch((error) => logger.error({ err: error }, 'Initial booking expiry pass failed'));
