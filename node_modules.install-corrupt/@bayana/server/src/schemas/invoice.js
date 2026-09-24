import { z } from 'zod';

const lineItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPaise: z.number().int().nonnegative(),
}).strict();

export const invoiceIdParams = z.object({ invoiceId: z.string().cuid() }).strict();
export const invoiceTokenParams = z.object({ token: z.string().min(10).max(200) }).strict();

export const createInvoiceSchema = z.object({
  clientId: z.string().cuid(),
  lineItems: z.array(lineItemSchema).min(1).max(50),
  gstPercent: z.number().min(0).max(28).default(18),
  notes: z.string().max(5000).optional(),
  dueDate: z.string().date().optional(),
}).strict();

export const updateInvoiceSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1).max(50).optional(),
  gstPercent: z.number().min(0).max(28).optional(),
  notes: z.string().max(5000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  status: z.enum(['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled']).optional(),
}).strict();

export const markPaidSchema = z.object({
  amount: z.number().int().positive().optional(),
}).strict();

export const invoicePaymentConfirmSchema = z.object({
  razorpayPaymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/).max(100),
  razorpayOrderId: z.string().regex(/^order_[A-Za-z0-9]+$/).max(100),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
