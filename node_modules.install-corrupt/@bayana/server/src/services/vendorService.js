import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../errors.js';

/** Returns the vendor profile (safe, no password). */
export async function getVendorProfile(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true, email: true, businessName: true, serviceType: true,
      location: true, phone: true, logoUrl: true, publicSlug: true,
      advanceAmountPaise: true, totalAmountPaise: true, terms: true,
      createdAt: true,
    },
  });
  if (!vendor) throw new NotFoundError('Vendor not found');
  return {
    ...vendor,
    advanceAmountPaise: Number(vendor.advanceAmountPaise),
    totalAmountPaise: Number(vendor.totalAmountPaise),
  };
}

/** Updates allowed vendor profile fields. Amounts must pass the advance <= total invariant. */
export async function updateVendorProfile(vendorId, input) {
  const data = { ...input };
  if (data.advanceAmountPaise !== undefined) data.advanceAmountPaise = BigInt(data.advanceAmountPaise);
  if (data.totalAmountPaise !== undefined) data.totalAmountPaise = BigInt(data.totalAmountPaise);

  // Verify invariant against current values if only one side is sent
  if (data.advanceAmountPaise !== undefined || data.totalAmountPaise !== undefined) {
    const current = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { advanceAmountPaise: true, totalAmountPaise: true } });
    if (!current) throw new NotFoundError('Vendor not found');
    const advance = data.advanceAmountPaise ?? current.advanceAmountPaise;
    const total = data.totalAmountPaise ?? current.totalAmountPaise;
    if (Number(total) < Number(advance)) throw new Error('Total must be at least the advance amount');
  }

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data,
    select: {
      id: true, email: true, businessName: true, serviceType: true,
      location: true, phone: true, logoUrl: true, publicSlug: true,
      advanceAmountPaise: true, totalAmountPaise: true, terms: true,
    },
  });
  return {
    ...vendor,
    advanceAmountPaise: Number(vendor.advanceAmountPaise),
    totalAmountPaise: Number(vendor.totalAmountPaise),
  };
}
