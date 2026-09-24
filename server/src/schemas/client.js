import { z } from 'zod';

export const clientIdParams = z.object({ clientId: z.string().cuid() }).strict();

export const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(20).optional(),
  eventDate: z.string().date().optional(),
  eventType: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['new', 'contacted', 'proposal_sent', 'booked', 'completed']).optional(),
}).strict();

export const updateClientSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(20).optional().nullable(),
  eventDate: z.string().date().optional().nullable(),
  eventType: z.string().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  status: z.enum(['new', 'contacted', 'proposal_sent', 'booked', 'completed']).optional(),
}).strict();
