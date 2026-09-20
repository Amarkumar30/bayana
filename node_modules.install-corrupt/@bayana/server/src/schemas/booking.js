import { z } from 'zod';
export const createBookingSchema = z.object({ clientName: z.string().min(2).max(100), clientEmail: z.string().email().max(254), eventDate: z.string().date(), acceptContract: z.literal(true) }).strict();
export const confirmPaymentSchema = z.object({ razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/).max(100), razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/).max(100), razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const publicSlugParams = z.object({ publicSlug: z.string().regex(/^[a-z0-9-]{3,60}$/) }).strict();
export const bookingIdParams = z.object({ bookingId: z.string().cuid() }).strict();
export const vendorIdParams = z.object({ vendorId: z.string().cuid() }).strict();
export const razorpayWebhookSchema = z.object({ event: z.string().max(100), payload: z.object({ payment: z.object({ entity: z.object({ id: z.string().regex(/^pay_[A-Za-z0-9]+$/), order_id: z.string().regex(/^order_[A-Za-z0-9]+$/), amount: z.number().int().positive(), currency: z.literal('INR'), status: z.string() }).strict() }).strict() }).strict() }).strict();
export const availabilityQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();
