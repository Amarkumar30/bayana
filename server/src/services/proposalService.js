import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from './emailService.js';

/** Calculates subtotal + GST total from line items and gstPercent (a %). */
function calculateTotals(lineItems, gstPercent) {
  const subtotalPaise = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPaise, 0);
  const gstAmountPaise = Math.round(subtotalPaise * gstPercent / 100);
  const totalPaise = subtotalPaise + gstAmountPaise;
  return { subtotalPaise, gstAmountPaise, totalPaise };
}

/** Asserts a proposal belongs to the vendor. */
async function assertOwnership(vendorId, proposalId) {
  const proposal = await prisma.proposal.findFirst({ where: { id: proposalId, vendorId } });
  if (!proposal) throw new NotFoundError('Proposal not found');
  return proposal;
}

/** Lists all proposals for a vendor. */
export const listProposals = (vendorId) =>
  prisma.proposal.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { id: true, name: true, email: true } } },
  });

/** Gets a single proposal (vendor-owned). */
export async function getProposal(vendorId, proposalId) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, vendorId },
    include: { client: true, vendor: { select: { businessName: true, serviceType: true, email: true, phone: true, logoUrl: true } } },
  });
  if (!proposal) throw new NotFoundError('Proposal not found');
  return proposal;
}

/** Creates a proposal and generates a public token. */
export async function createProposal(vendorId, input) {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, vendorId } });
  if (!client) throw new NotFoundError('Client not found');

  const { subtotalPaise, gstAmountPaise, totalPaise } = calculateTotals(input.lineItems, input.gstPercent ?? 0);
  const publicToken = crypto.randomBytes(32).toString('hex');

  return prisma.proposal.create({
    data: {
      vendorId,
      clientId: input.clientId,
      title: input.title,
      lineItems: input.lineItems,
      subtotalPaise,
      gstPercent: input.gstPercent ?? 0,
      totalPaise,
      notes: input.notes,
      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      publicToken,
    },
  });
}

/** Updates a draft proposal. Sent/accepted proposals cannot be edited (only status to declined). */
export async function updateProposal(vendorId, proposalId, input) {
  const proposal = await assertOwnership(vendorId, proposalId);
  if (proposal.status === 'accepted' || proposal.status === 'declined') {
    throw new ConflictError(`Proposal is already ${proposal.status} and cannot be modified`);
  }
  const data = { ...input };
  if (data.validUntil !== undefined) data.validUntil = data.validUntil ? new Date(data.validUntil) : null;
  if (data.lineItems !== undefined || data.gstPercent !== undefined) {
    const lineItems = data.lineItems ?? proposal.lineItems;
    const gstPercent = data.gstPercent ?? Number(proposal.gstPercent);
    const { subtotalPaise, gstAmountPaise, totalPaise } = calculateTotals(lineItems, gstPercent);
    data.subtotalPaise = subtotalPaise;
    data.gstAmountPaise = gstAmountPaise;
    data.totalPaise = totalPaise;
  }
  if (data.status === 'sent' && proposal.status === 'draft') {
    data.sentAt = new Date();
    // Update client status
    await prisma.client.update({ where: { id: proposal.clientId }, data: { status: 'proposal_sent' } }).catch(() => {});
  }
  return prisma.proposal.update({ where: { id: proposalId }, data, include: { client: { select: { id: true, name: true, email: true } } } });
}

/** Sends proposal email and marks as sent. */
export async function sendProposal(vendorId, proposalId, baseUrl) {
  const proposal = await getProposal(vendorId, proposalId);
  if (proposal.status === 'accepted') throw new ConflictError('Proposal is already accepted');
  const publicUrl = `${baseUrl}/portal/proposals/${proposal.publicToken}`;
  await sendEmail({
    to: proposal.client.email,
    subject: `Proposal from ${proposal.vendor.businessName}: ${proposal.title}`,
    text: `Hi ${proposal.client.name},\n\nPlease review and accept your proposal:\n${publicUrl}\n\nValid until: ${proposal.validUntil ? new Date(proposal.validUntil).toLocaleDateString('en-IN') : 'No expiry'}\n\nThank you!\n${proposal.vendor.businessName}`,
    html: `<p>Hi ${proposal.client.name},</p><p>Please review and accept your proposal:<br><a href="${publicUrl}">${publicUrl}</a></p><p>Valid until: ${proposal.validUntil ? new Date(proposal.validUntil).toLocaleDateString('en-IN') : 'No expiry'}</p><p>Thank you!<br><strong>${proposal.vendor.businessName}</strong></p>`,
  });
  return updateProposal(vendorId, proposalId, { status: 'sent' });
}

/** Deletes a draft proposal. */
export async function deleteProposal(vendorId, proposalId) {
  const proposal = await assertOwnership(vendorId, proposalId);
  if (proposal.status !== 'draft') throw new ConflictError('Only draft proposals can be deleted');
  await prisma.proposal.delete({ where: { id: proposalId } });
}

/** Public: gets proposal by token for client portal. */
export async function getPublicProposal(token) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicToken: token },
    include: {
      vendor: { select: { businessName: true, serviceType: true, email: true, phone: true, logoUrl: true } },
      client: { select: { name: true, email: true } },
    },
  });
  if (!proposal) throw new NotFoundError('Proposal not found');
  return proposal;
}

/** Public: client accepts a proposal. */
export async function acceptProposal(token, input) {
  const proposal = await prisma.proposal.findUnique({ where: { publicToken: token }, include: { client: true } });
  if (!proposal) throw new NotFoundError('Proposal not found');
  if (proposal.status === 'accepted') return proposal; // idempotent
  if (proposal.status === 'declined') throw new ConflictError('This proposal has been declined');
  if (proposal.validUntil && proposal.validUntil < new Date()) throw new ConflictError('This proposal has expired');

  const updated = await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: 'accepted', acceptedAt: new Date() },
  });
  // Update client pipeline status
  await prisma.client.update({ where: { id: proposal.clientId }, data: { status: 'booked' } }).catch(() => {});
  logger.info({ proposalId: proposal.id }, 'Proposal accepted by client');
  return updated;
}
