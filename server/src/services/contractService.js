import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../errors.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from './emailService.js';

/** Generates contract data from a confirmed booking (kept for backward compat). */
export function generateContract(booking) {
  return {
    bookingId: booking.id,
    vendorId: booking.vendorId,
    businessName: booking.vendor.businessName,
    clientName: booking.clientName,
    eventDate: booking.eventDate,
    advanceAmountPaise: booking.advanceAmountPaise,
    totalAmountPaise: booking.totalAmountPaise,
    terms: booking.vendor.terms,
    acceptedAt: booking.contractAcceptedAt,
    publicToken: crypto.randomBytes(32).toString('hex'),
  };
}

/** Lists standalone contracts for a vendor (not linked to booking-flow contracts). */
export const listContracts = (vendorId) =>
  prisma.contract.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { id: true, name: true, email: true } } },
  });

/** Gets a single contract (vendor-owned). */
export async function getContract(vendorId, contractId) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, vendorId },
    include: {
      client: true,
      vendor: { select: { businessName: true, serviceType: true, email: true, phone: true, logoUrl: true } },
    },
  });
  if (!contract) throw new NotFoundError('Contract not found');
  return contract;
}

/** Creates a standalone contract (not linked to booking payment flow). */
export async function createStandaloneContract(vendorId, input) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { businessName: true } });
  if (!vendor) throw new NotFoundError('Vendor not found');
  const client = await prisma.client.findFirst({ where: { id: input.clientId, vendorId } });
  if (!client) throw new NotFoundError('Client not found');

  const publicToken = crypto.randomBytes(32).toString('hex');
  return prisma.contract.create({
    data: {
      vendorId,
      clientId: input.clientId,
      businessName: vendor.businessName,
      clientName: input.clientName,
      eventDate: new Date(input.eventDate),
      advanceAmountPaise: input.advanceAmountPaise,
      totalAmountPaise: input.totalAmountPaise,
      terms: input.terms,
      publicToken,
    },
  });
}

/** Sends contract email and provides signing link. */
export async function sendContract(vendorId, contractId, baseUrl) {
  const contract = await getContract(vendorId, contractId);
  if (contract.acceptedAt) throw new ConflictError('Contract is already signed');
  const publicUrl = `${baseUrl}/portal/contracts/${contract.publicToken}`;
  await sendEmail({
    to: contract.client.email,
    subject: `Contract from ${contract.vendor.businessName} – Please sign`,
    text: `Hi ${contract.clientName},\n\nPlease review and sign your contract:\n${publicUrl}\n\nThank you!\n${contract.vendor.businessName}`,
    html: `<p>Hi ${contract.clientName},</p><p>Please review and sign your contract:<br><a href="${publicUrl}">${publicUrl}</a></p><p>Thank you!<br><strong>${contract.vendor.businessName}</strong></p>`,
  });
  return contract;
}

/** Deletes an unsigned contract. */
export async function deleteContract(vendorId, contractId) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, vendorId } });
  if (!contract) throw new NotFoundError('Contract not found');
  if (contract.acceptedAt) throw new ConflictError('Signed contracts cannot be deleted');
  await prisma.contract.delete({ where: { id: contractId } });
}

/** Public: gets contract by token for client portal. */
export async function getPublicContract(token) {
  const contract = await prisma.contract.findUnique({
    where: { publicToken: token },
    include: { vendor: { select: { businessName: true, serviceType: true, email: true, logoUrl: true } } },
  });
  if (!contract) throw new NotFoundError('Contract not found');
  return contract;
}

/** Public: client signs the contract. */
export async function signContract(token, input) {
  const contract = await prisma.contract.findUnique({ where: { publicToken: token } });
  if (!contract) throw new NotFoundError('Contract not found');
  if (contract.acceptedAt) return contract; // idempotent
  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { acceptedAt: new Date(), signedByName: input.signedByName },
  });
  // Update linked booking if present
  if (contract.bookingId) {
    await prisma.booking.update({ where: { id: contract.bookingId }, data: { contractAcceptedAt: new Date() } }).catch(() => {});
  }
  logger.info({ contractId: contract.id }, 'Contract signed by client');
  return updated;
}
