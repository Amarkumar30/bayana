import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const prisma = enabled ? new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }) : null;
describe.skipIf(!enabled)('PostgreSQL booking concurrency', () => {
  let vendor;
  beforeAll(async () => { vendor = await prisma.vendor.create({ data: { email: `concurrency-${Date.now()}@test.invalid`, passwordHash: 'not-used-in-test', businessName: 'Concurrency Test', publicSlug: `concurrency-${Date.now()}`, advanceAmountPaise: 100, totalAmountPaise: 100 } }); });
  afterAll(async () => { if (prisma) await prisma.$disconnect(); });
  it('allows precisely one confirmed booking for a vendor and date', async () => {
    const eventDate = new Date('2030-01-01T00:00:00.000Z');
    const create = (suffix) => prisma.booking.create({ data: { vendorId: vendor.id, clientName: `Client ${suffix}`, clientEmail: `client-${suffix}@test.invalid`, eventDate, status: 'confirmed', advanceAmountPaise: 100, totalAmountPaise: 100, contractAcceptedAt: new Date() } });
    const results = await Promise.allSettled([create('a'), create('b')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason.code).toBe('P2002');
  });
});
