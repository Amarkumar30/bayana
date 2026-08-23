import { z } from 'zod';
export const bookingSchema = z.object({ clientName: z.string().min(2), clientEmail: z.string().email(), eventDate: z.string().date(), acceptContract: z.literal(true, { errorMap: () => ({ message: 'You must accept the contract' }) }) });
