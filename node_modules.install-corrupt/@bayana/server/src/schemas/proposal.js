import { z } from 'zod';

const lineItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPaise: z.number().int().nonnegative(),
}).strict();

export const proposalIdParams = z.object({ proposalId: z.string().cuid() }).strict();
export const proposalTokenParams = z.object({ token: z.string().min(10).max(200) }).strict();

export const createProposalSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(2).max(200),
  lineItems: z.array(lineItemSchema).min(1).max(50),
  gstPercent: z.number().min(0).max(28).default(0),
  notes: z.string().max(5000).optional(),
  validUntil: z.string().date().optional(),
}).strict();

export const updateProposalSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  lineItems: z.array(lineItemSchema).min(1).max(50).optional(),
  gstPercent: z.number().min(0).max(28).optional(),
  notes: z.string().max(5000).optional().nullable(),
  validUntil: z.string().date().optional().nullable(),
  status: z.enum(['draft', 'sent', 'accepted', 'declined']).optional(),
}).strict();

export const acceptProposalSchema = z.object({
  clientName: z.string().min(2).max(100),
}).strict();
