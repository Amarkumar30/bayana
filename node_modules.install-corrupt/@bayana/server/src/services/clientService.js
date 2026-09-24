import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../errors.js';

/** Lists all clients for a vendor, newest first. */
export const listClients = (vendorId) =>
  prisma.client.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { proposals: true, invoices: true } } },
  });

/** Gets a single client (must belong to vendor). */
export async function getClient(vendorId, clientId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, vendorId },
    include: {
      proposals: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, totalPaise: true, createdAt: true } },
      invoices: { orderBy: { createdAt: 'desc' }, select: { id: true, invoiceNumber: true, status: true, totalPaise: true, dueDate: true } },
    },
  });
  if (!client) throw new NotFoundError('Client not found');
  return client;
}

/** Creates a new client lead. */
export const createClient = (vendorId, input) =>
  prisma.client.create({ data: { ...input, vendorId, eventDate: input.eventDate ? new Date(input.eventDate) : undefined } });

/** Updates a client. */
export async function updateClient(vendorId, clientId, input) {
  const existing = await prisma.client.findFirst({ where: { id: clientId, vendorId } });
  if (!existing) throw new NotFoundError('Client not found');
  const data = { ...input };
  if (data.eventDate !== undefined) data.eventDate = data.eventDate ? new Date(data.eventDate) : null;
  return prisma.client.update({ where: { id: clientId }, data });
}

/** Deletes a client (must belong to vendor). */
export async function deleteClient(vendorId, clientId) {
  const existing = await prisma.client.findFirst({ where: { id: clientId, vendorId } });
  if (!existing) throw new NotFoundError('Client not found');
  await prisma.client.delete({ where: { id: clientId } });
}
