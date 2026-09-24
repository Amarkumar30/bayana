import { z } from 'zod';

export const updateProfileSchema = z.object({
  businessName: z.string().min(2).max(100).optional(),
  serviceType: z.string().min(2).max(100).optional(),
  location: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  logoUrl: z.string().url().max(500).optional().nullable(),
  advanceAmountPaise: z.number().int().positive().optional(),
  totalAmountPaise: z.number().int().positive().optional(),
  terms: z.string().max(10000).optional(),
}).strict().refine(
  (v) => {
    if (v.advanceAmountPaise != null && v.totalAmountPaise != null) {
      return v.totalAmountPaise >= v.advanceAmountPaise;
    }
    return true;
  },
  { message: 'Total must be at least the advance amount' }
);
