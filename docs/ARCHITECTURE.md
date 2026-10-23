# Architecture

The repository is a pnpm workspace: `apps/web` is a Next.js App Router UI; `apps/api` is an Express TypeScript API; `packages/shared` contains deterministic money/slug logic.

The API uses PostgreSQL transactions. The partial unique index `one_active_booking_per_day` is the final authority preventing double sales: only one `HELD`, `CONFIRMED`, or `COMPLETED` booking can exist for a photographer/date. `createHold` expires stale holds inside the transaction, locks the photographer row, snapshots the server-calculated price and advance, and uses an idempotency key.

Amounts are integer paise. `ledger_entries` is append-only at database level, and balance is derived instead of directly edited. Booking statuses may only change through `transition`.

`PAYMENT_MODE=mock` is a local UX aid. Replace it with a provider interface and verified Razorpay webhook before accepting real money.
