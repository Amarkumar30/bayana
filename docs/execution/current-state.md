# Current Project State

Last analyzed: 2026-09-20

## Executive Summary

Bayana has a committed MVP foundation for public vendor booking with Razorpay advance payments and PostgreSQL-backed prevention of duplicate confirmed dates. The repository is on `main` with a clean working tree. The implementation was added in `37407e7` on 2026-08-23; `f8986cb` subsequently merged only the historical project plan.

## Overall Status

The public booking/payment core is implemented, while vendor self-service and several production-operational items described in planning remain absent or partial.

## Completed

### Public booking and payment

- Public vendor profile and monthly availability endpoints are implemented.
- The React page selects a future available date, collects name/email, requires terms acceptance, creates a Razorpay order, opens Checkout, and displays confirmation.
- Server code calculates amounts from `Vendor`, validates Checkout HMAC, fetches the Razorpay payment, and verifies order, amount, INR currency, and captured state.
- The signed `payment.captured` webhook uses the same idempotent confirmation path.
- Files: `client/src/main.jsx`, `client/src/api/bookings.js`, `server/src/routes/bookings.js`, `server/src/services/bookingService.js`.

### Booking integrity

- Booking creation writes pending booking, payment, and history in a transaction; holds last 30 minutes.
- Confirmation writes booking state, payment state, immutable contract, and history in a transaction.
- The confirmed-date partial unique index is the final double-booking guard and its conflict becomes a 409.
- Startup and one-minute expiry processing expires unpaid holds; history is append-only at the database level.
- Files: `server/prisma/schema.prisma`, `server/prisma/migrations/`, `server/src/services/bookingService.js`.

### Vendor auth and private booking list

- Signup/login use bcrypt, 15-minute access JWTs, and persisted-hash/rotated 30-day refresh JWT cookies.
- The vendor booking-list route requires bearer authentication and matching JWT subject/vendor ID.
- Files: `server/src/routes/auth.js`, `server/src/services/authService.js`, `server/src/middleware/auth.js`.

### Safety and basic operations

- Strict Zod validation, centralized safe errors, Pino redaction, CORS, body limits, and in-memory auth/public rate limits are present.
- Development Swagger UI and required environment validation are present.

## In Progress

No current work can be established: there are no uncommitted changes, feature branches, or implementation commits after the original MVP. The project plan indicates intended work, not an active code workstream.

## Partially Implemented

### Vendor dashboard

Status: read-only shell.

Implemented:

- `/vendor` lists bookings when `VITE_VENDOR_ID` and `VITE_VENDOR_TOKEN` are supplied.
- It has an empty state and copy-link control.

Remaining:

- In-app login/session handling; vendor-specific link handling; onboarding/profile/price/terms UI; date-block management; calendar management.

Files: `client/src/main.jsx`, `client/src/api/bookings.js`.

### Blocked-date availability

Status: read support only. `BlockedDate` is in schema/migrations and appears as `blocked` in public availability, but no API or UI writes it.

### API docs

`docs/swagger.yaml` lists most primary endpoints but omits implemented refresh/logout routes and detailed schemas/responses.

## Known Issues

- Logout clears the cookie but does not revoke the stored refresh token.
- No scheduled payment reconciliation repairs cases where payment succeeds but both browser confirmation and webhook processing are missed.
- Rate limiting is per process; expiry processing is in-process, not durable scheduling.
- The demo seed bypasses normal payment/history/contract flow and can produce intentionally incomplete record relationships.

## Technical Debt

- Tests cover only a modeled concurrency unit test and an opt-in database unique-index test. No client, HTTP/Supertest, auth, webhook, or end-to-end coverage exists.
- No lockfile, CI, Docker, or deployment config is committed.
- `client/src/main.jsx` combines route selection, public UX, payment UI, and dashboard shell.

## Unfinished Work

- Cancellation/refund API, service, and UI flows.
- Vendor CRUD/onboarding/profile/price/terms management.
- Blocked-date writes, a real vendor calendar, notifications, download/rendered contract delivery, and deployment configuration.
- The plan's dynamic `/book/:vendorSlug` client route: current public UI uses one `VITE_PUBLIC_SLUG`.

## Database State

Three migrations define vendor, booking, payment, token, contract, history, profile, and blocked-date tables. Currency is `NUMERIC(12,0)`. The confirmed-date unique index and history triggers are critical protections. Applied migration state cannot be determined without a database connection.

## API State

Routes in `server/src/routes/auth.js` and `server/src/routes/bookings.js` define the actual API. The webhook is registered before JSON parsing to preserve its raw signed body. Protected vendor access currently covers booking listing only.

## Frontend State

The public flow has responsive styling, calendar, loading/error states, local validation, Razorpay Checkout, and print-oriented confirmation. The dashboard is runtime-configured, not a complete authenticated app. No client tests exist.

## Testing State

`npm test` runs server Vitest. The real PostgreSQL race test needs `TEST_DATABASE_URL` against a migrated database and otherwise skips. At analysis time, `npm test` and `npm --workspace client run build` could not start because dependencies are not installed (`vitest` and `vite` were unavailable); install dependencies before using either result as a pass/fail signal.

## Infrastructure / Deployment State

The API has environment validation, CORS, health endpoint, Swagger outside production, and Pino logs. No committed CI/CD, container, host, external secret management, or monitoring setup exists. Hosting/notifications named in the plan are not implementation evidence.

## Important Recent Changes

- `37407e7` (2026-08-23): initial Bayana MVP implementation, migrations, docs, client, and tests.
- `f8986cb` (2026-08-23): merge adding `bayana-project-plan.md`; no application-code change.

## Current Workstream

No active code work is evident. The clearest gap after the booking core is vendor self-service: schema support and a read-only dashboard exist, while supporting APIs/UI do not.

## Recommended Continuation Point

Choose the smallest authenticated vendor-management vertical slice that makes the dashboard self-sufficient—starting with secure in-app login/session handling and vendor-specific dashboard context. Add matching API routes, Zod schemas, ownership enforcement, UI, Swagger updates, and tests. Do not infer cancellation, refunds, or messaging as immediate scope merely because the plan lists them.

## Relevant Files

- `ARCHITECTURE.md`: system model and constraints.
- `docs/LOGIC.md`: detailed booking/payment behavior.
- `server/src/services/bookingService.js`: booking, payment, webhook, expiry logic.
- `server/src/services/authService.js`: credentials and refresh rotation.
- `server/prisma/schema.prisma`: persistent model.
- `server/prisma/migrations/20260823000000_initial/migration.sql`: confirmed-date index.
- `client/src/main.jsx`: current browser experience.
- `docs/swagger.yaml`: API documentation.

## Uncertainty / Notes

No deployed environment, applied-database state, CI records, issue tracker, or Razorpay account configuration is committed, so production readiness cannot be concluded. The project plan substantially exceeds the code and is deliberately not used as implementation status.
