import { prisma } from '../lib/prisma.js';

/** Returns dashboard stats for a vendor:
 *  - total clients, pending invoices (count + amount), this-month revenue, recent activity
 */
export async function getDashboardStats(vendorId) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [
    totalClients,
    pendingInvoices,
    paidThisMonth,
    recentClients,
    recentInvoices,
    recentProposals,
  ] = await Promise.all([
    prisma.client.count({ where: { vendorId } }),
    prisma.invoice.findMany({
      where: { vendorId, status: { in: ['sent', 'overdue', 'partially_paid'] } },
      select: { totalPaise: true, paidPaise: true },
    }),
    prisma.invoice.aggregate({
      where: { vendorId, status: 'paid', paidAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalPaise: true },
    }),
    prisma.client.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, status: true, createdAt: true } }),
    prisma.invoice.findMany({ where: { vendorId }, orderBy: { updatedAt: 'desc' }, take: 5, include: { client: { select: { name: true } } } }),
    prisma.proposal.findMany({ where: { vendorId }, orderBy: { updatedAt: 'desc' }, take: 5, include: { client: { select: { name: true } } } }),
  ]);

  const pendingAmountPaise = pendingInvoices.reduce(
    (sum, inv) => sum + (Number(inv.totalPaise) - Number(inv.paidPaise)), 0
  );

  // Build a recent-activity feed from multiple sources
  const activity = [
    ...recentClients.map((c) => ({ type: 'client', id: c.id, label: `New client: ${c.name}`, status: c.status, at: c.createdAt })),
    ...recentInvoices.map((i) => ({ type: 'invoice', id: i.id, label: `Invoice for ${i.client.name}`, status: i.status, at: i.updatedAt })),
    ...recentProposals.map((p) => ({ type: 'proposal', id: p.id, label: `Proposal for ${p.client.name}`, status: p.status, at: p.updatedAt })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);

  return {
    totalClients,
    pendingInvoiceCount: pendingInvoices.length,
    pendingAmountPaise,
    revenueThisMonthPaise: Number(paidThisMonth._sum.totalPaise ?? 0),
    activity,
  };
}
