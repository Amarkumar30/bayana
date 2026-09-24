import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from './emailService.js';

const razorpay = new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET });

/** Calculates totals from line items and GST percent. */
function calculateTotals(lineItems, gstPercent) {
  const subtotalPaise = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPaise, 0);
  const gstAmountPaise = Math.round(subtotalPaise * Number(gstPercent) / 100);
  const totalPaise = subtotalPaise + gstAmountPaise;
  return { subtotalPaise, gstAmountPaise, totalPaise };
}

/** Generates sequential invoice number: INV-vendorPrefix-YYYYMM-NNN */
async function nextInvoiceNumber(vendorId) {
  const count = await prisma.invoice.count({ where: { vendorId } });
  const prefix = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count + 1).padStart(3, '0')}`;
  return prefix;
}

/** Asserts invoice belongs to vendor. */
async function assertOwnership(vendorId, invoiceId) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, vendorId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

/** Lists invoices for a vendor. */
export const listInvoices = (vendorId) =>
  prisma.invoice.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { id: true, name: true, email: true } } },
  });

/** Gets a single invoice (vendor-owned). */
export async function getInvoice(vendorId, invoiceId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, vendorId },
    include: {
      client: true,
      vendor: { select: { businessName: true, serviceType: true, email: true, phone: true, logoUrl: true, publicSlug: true } },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

/** Creates an invoice with auto-generated number and public token. */
export async function createInvoice(vendorId, input) {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, vendorId } });
  if (!client) throw new NotFoundError('Client not found');

  const { subtotalPaise, gstAmountPaise, totalPaise } = calculateTotals(input.lineItems, input.gstPercent ?? 18);
  const [invoiceNumber, publicToken] = [await nextInvoiceNumber(vendorId), crypto.randomBytes(32).toString('hex')];

  return prisma.invoice.create({
    data: {
      vendorId, clientId: input.clientId, invoiceNumber,
      lineItems: input.lineItems,
      subtotalPaise, gstPercent: input.gstPercent ?? 18, gstAmountPaise, totalPaise,
      notes: input.notes,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      publicToken,
    },
  });
}

/** Updates a draft invoice. */
export async function updateInvoice(vendorId, invoiceId, input) {
  const invoice = await assertOwnership(vendorId, invoiceId);
  if (['paid', 'cancelled'].includes(invoice.status)) {
    throw new ConflictError(`Invoice is ${invoice.status} and cannot be modified`);
  }
  const data = { ...input };
  if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.lineItems !== undefined || data.gstPercent !== undefined) {
    const lineItems = data.lineItems ?? invoice.lineItems;
    const gstPercent = data.gstPercent ?? Number(invoice.gstPercent);
    const { subtotalPaise, gstAmountPaise, totalPaise } = calculateTotals(lineItems, gstPercent);
    data.subtotalPaise = subtotalPaise;
    data.gstAmountPaise = gstAmountPaise;
    data.totalPaise = totalPaise;
  }
  if (data.status === 'sent' && invoice.status === 'draft') data.sentAt = new Date();
  return prisma.invoice.update({ where: { id: invoiceId }, data });
}

/** Sends invoice email and marks as sent. */
export async function sendInvoice(vendorId, invoiceId, baseUrl) {
  const invoice = await getInvoice(vendorId, invoiceId);
  if (invoice.status === 'paid') throw new ConflictError('Invoice is already paid');
  const publicUrl = `${baseUrl}/portal/invoices/${invoice.publicToken}`;
  const amount = (Number(invoice.totalPaise) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  await sendEmail({
    to: invoice.client.email,
    subject: `Invoice ${invoice.invoiceNumber} from ${invoice.vendor.businessName}`,
    text: `Hi ${invoice.client.name},\n\nYour invoice for ${amount} is ready:\n${publicUrl}\n\nDue: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'On receipt'}\n\nThank you!\n${invoice.vendor.businessName}`,
    html: `<p>Hi ${invoice.client.name},</p><p>Your invoice <strong>${invoice.invoiceNumber}</strong> for <strong>${amount}</strong> is ready:<br><a href="${publicUrl}">${publicUrl}</a></p><p>Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'On receipt'}</p><p>Thank you!<br><strong>${invoice.vendor.businessName}</strong></p>`,
  });
  return updateInvoice(vendorId, invoiceId, { status: 'sent' });
}

/** Mark invoice as manually paid (full or partial). */
export async function markInvoicePaid(vendorId, invoiceId, amountPaise) {
  const invoice = await assertOwnership(vendorId, invoiceId);
  const paid = amountPaise ?? Number(invoice.totalPaise);
  const newPaid = Number(invoice.paidPaise) + paid;
  const status = newPaid >= Number(invoice.totalPaise) ? 'paid' : 'partially_paid';
  const data = { paidPaise: newPaid, status };
  if (status === 'paid') data.paidAt = new Date();
  return prisma.invoice.update({ where: { id: invoiceId }, data });
}

/** Deletes a draft invoice. */
export async function deleteInvoice(vendorId, invoiceId) {
  const invoice = await assertOwnership(vendorId, invoiceId);
  if (invoice.status !== 'draft') throw new ConflictError('Only draft invoices can be deleted');
  await prisma.invoice.delete({ where: { id: invoiceId } });
}

/** Public: gets invoice by token. */
export async function getPublicInvoice(token) {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: {
      vendor: { select: { businessName: true, serviceType: true, email: true, phone: true, logoUrl: true } },
      client: { select: { name: true, email: true } },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
}

/** Public: creates a Razorpay order for an invoice payment. */
export async function createInvoiceOrder(token) {
  const invoice = await prisma.invoice.findUnique({ where: { publicToken: token } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status === 'paid') throw new ConflictError('Invoice is already paid');
  const remaining = Number(invoice.totalPaise) - Number(invoice.paidPaise);
  if (remaining <= 0) throw new ConflictError('Invoice is already fully paid');

  const order = await razorpay.orders.create({
    amount: remaining,
    currency: 'INR',
    receipt: `bayana_inv_${invoice.id.slice(0, 20)}`,
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { razorpayOrderId: order.id } });
  return { orderId: order.id, amount: remaining, razorpayKeyId: config.RAZORPAY_KEY_ID, invoiceId: invoice.id };
}

/** Public: confirms Razorpay invoice payment after checkout. */
export async function confirmInvoicePayment(token, proof) {
  const expected = crypto.createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${proof.razorpayOrderId}|${proof.razorpayPaymentId}`).digest('hex');
  if (proof.razorpaySignature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(proof.razorpaySignature))) {
    throw new ValidationError('Invalid payment signature');
  }
  const invoice = await prisma.invoice.findUnique({ where: { publicToken: token } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.razorpayOrderId !== proof.razorpayOrderId) throw new ValidationError('Order ID mismatch');

  const payment = await razorpay.payments.fetch(proof.razorpayPaymentId);
  if (payment.order_id !== proof.razorpayOrderId || payment.status !== 'captured') throw new ValidationError('Payment not captured');

  const newPaid = Number(invoice.paidPaise) + payment.amount;
  const status = newPaid >= Number(invoice.totalPaise) ? 'paid' : 'partially_paid';
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { paidPaise: newPaid, status, paidAt: status === 'paid' ? new Date() : null, razorpayPaymentId: proof.razorpayPaymentId },
  });
  logger.info({ invoiceId: invoice.id, status }, 'Invoice payment confirmed');
  return updated;
}
