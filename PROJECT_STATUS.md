# Bayana project status and LLM handoff

Last updated: 2026-10-22

## What is implemented

- pnpm monorepo with Next.js web UI, Express API, shared TypeScript package, Docker PostgreSQL definition, environment template, documentation, and money tests.
- PostgreSQL schema with `citext` slugs, availability, bookings, partial unique active-booking index, events, payments, webhook event table, and append-only ledger trigger.
- Public photographer endpoint/page, seeded demo photographer, date selection, idempotent transactional hold creation, status transition guard, derived balance endpoint, and mock local payment capture.
- Responsive landing page, polished booking page, and photographer demo dashboard with booking summary, availability controls, and a copyable share link.
- Dashboard and availability API endpoints plus an offline-balance recording endpoint. These are local-demo features until authentication and ownership checks are added.

## What is intentionally not complete

This is a working local MVP foundation, **not a live-payment-ready marketplace**. Before any pilot, implement and test: Razorpay Orders/Route plus raw-body HMAC webhook verification and idempotency; refund and reconciliation jobs; email OTP/session auth/ownership; photographer onboarding, pricing and availability management; offline balance audit endpoint; rate limits/security headers; emails; legal/privacy/deletion flow; telemetry/backups/CI and end-to-end/concurrency tests.

## Non-negotiable invariants

1. Integer paise only—never floats.
2. Server calculates every price and advance.
3. Database, not application checks, prevents double booking.
4. Confirm payment only from a verified webhook/server-side gateway fetch.
5. Ledger never updates/deletes; corrections append entries.
6. All money/status writes happen in one transaction and are idempotent.

## Next implementation order

1. Add Postgres integration tests: 50 concurrent holds, stale-hold race, and block-versus-book race.
2. Extract a payment provider interface; implement Razorpay test-mode orders and verified raw webhook handling.
3. Add webhook deduplication, capture transaction, refunds, and reconciliation.
4. Add OTP auth, roles/ownership, and photographer dashboard APIs/UI.
5. Harden/deploy only after the full security and money test suite passes.

## Local workflow

Copy `.env.example` to `apps/api/.env`; start Postgres; run migration and seed; `pnpm dev`. Details are in `README.md`. The current execution environment lacks Docker, so DB runtime tests have not been performed here.
