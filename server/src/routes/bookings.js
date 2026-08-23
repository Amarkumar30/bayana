import { Router } from 'express';
import { createBookingSchema, confirmPaymentSchema, publicSlugParams, bookingIdParams, vendorIdParams, availabilityQuerySchema } from '../schemas/booking.js';
import { validate } from '../middleware/validate.js';
import { authenticate, ensureOwnership } from '../middleware/auth.js';
import { createBooking, confirmPayment, listVendorBookings, processRazorpayWebhook, getPublicVendor, getAvailability } from '../services/bookingService.js';
import { razorpayWebhookSchema } from '../schemas/booking.js';
import crypto from 'node:crypto';
import { config } from '../lib/config.js';
import { UnauthorizedError } from '../errors.js';
const router = Router();
router.get('/public/vendors/:publicSlug', validate(publicSlugParams, 'params'), async (req, res, next) => { try { res.json(await getPublicVendor(req.params.publicSlug)); } catch (e) { next(e); } });
router.get('/public/vendors/:publicSlug/availability', validate(publicSlugParams, 'params'), validate(availabilityQuerySchema, 'query'), async (req, res, next) => { try { res.json(await getAvailability(req.params.publicSlug, req.query.month)); } catch (e) { next(e); } });
router.post('/public/vendors/:publicSlug/bookings', validate(publicSlugParams, 'params'), validate(createBookingSchema), async (req, res, next) => { try { res.status(201).json(await createBooking(req.params.publicSlug, req.body)); } catch (e) { next(e); } });
router.post('/public/bookings/:bookingId/confirm-payment', validate(bookingIdParams, 'params'), validate(confirmPaymentSchema), async (req, res, next) => { try { res.json(await confirmPayment(req.params.bookingId, req.body)); } catch (e) { next(e); } });
router.get('/vendors/:vendorId/bookings', authenticate, validate(vendorIdParams, 'params'), ensureOwnership(), async (req, res, next) => { try { res.json(await listVendorBookings(req.params.vendorId)); } catch (e) { next(e); } });
export async function razorpayWebhook(req, res, next) { try { const signature = req.get('x-razorpay-signature'); const expected = crypto.createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex'); if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedError('Invalid Razorpay webhook signature'); const event = razorpayWebhookSchema.parse(JSON.parse(req.body.toString('utf8'))); await processRazorpayWebhook(event); res.status(204).end(); } catch (error) { next(error); } }
export default router;
