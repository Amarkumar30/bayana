import { describe, expect, it } from 'vitest';
import { ConflictError } from '../src/errors.js';
import { runConfirmationTransaction } from '../src/services/bookingService.js';

describe('booking confirmation concurrency', () => {
  it('allows exactly one simultaneous confirmation and gives the loser a typed conflict', async () => {
    let confirmed = false;
    // Models the database partial unique index: both requests race, but only the first commit wins.
    const confirm = () => runConfirmationTransaction(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); if (confirmed) { const error = new Error('unique index'); error.code = 'P2002'; throw error; } confirmed = true; return { status: 'confirmed' }; });
    const outcomes = await Promise.allSettled([confirm(), confirm()]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect(rejected.reason.statusCode).toBe(409);
  });
});
