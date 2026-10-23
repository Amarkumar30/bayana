# Bayana engineering rules

Use strict TypeScript. The system is a Next.js web app, Express API, PostgreSQL database, and shared package.

- Represent money only as integer paise (`bigint` in PostgreSQL). Never use JavaScript floating point in money paths.
- Server derives prices; the browser never submits an amount.
- Use database constraints and transactions for availability/booking correctness.
- Active bookings are HELD, CONFIRMED, COMPLETED; never bypass `transition()` for a status change.
- Money records are append-only. Do not update or delete ledger entries.
- Provider webhooks must be signature-verified, deduplicated, and transactional before affecting payment state.
- Add tests for every money, status, idempotency, or concurrency change and update `docs/LOGIC.md` and `PROJECT_STATUS.md`.
