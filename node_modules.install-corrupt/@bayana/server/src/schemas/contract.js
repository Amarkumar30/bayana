import { z } from 'zod';

export const contractIdParams = z.object({ contractId: z.string().cuid() }).strict();
export const contractTokenParams = z.object({ token: z.string().min(10).max(200) }).strict();

export const createContractSchema = z.object({
  clientId: z.string().cuid(),
  clientName: z.string().min(2).max(100),
  eventDate: z.string().date(),
  advanceAmountPaise: z.number().int().nonnegative(),
  totalAmountPaise: z.number().int().positive(),
  terms: z.string().max(10000),
}).strict().refine(
  (v) => v.totalAmountPaise >= v.advanceAmountPaise,
  { message: 'Total must be at least the advance amount' }
);

export const signContractSchema = z.object({
  signedByName: z.string().min(2).max(100),
}).strict();
