# Bayana Phase 0 Audit

Status: VERIFIED findings are backed by command output or a real `_test` API request; SUSPECTED findings are source-only. Audit date: 2026-10-23.

## Git and inventory

- VERIFIED: branch `main`, tracking `origin/main`; HEAD `defc0df Initial commit of Bayana project`; no uncommitted files at audit start. There is one commit, not fifteen.
- VERIFIED: workspace packages are `@bayana/api`, `@bayana/web`, and `@bayana/shared`. Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`; API: `dev`, `build`, `start`, `migrate`, `seed`, `test`, `lint`, `typecheck`; web/shared: `build`, `lint`, `typecheck` as applicable.
- VERIFIED: API environment variables read: `NODE_ENV`, `PORT`, `WEB_ORIGIN`, `DATABASE_URL`, `HOLD_MINUTES`, `MIN_ADVANCE_PAISE`, `PAYMENT_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMTP_URL`, `EMAIL_FROM`, `SESSION_SECRET` (`apps/api/src/config.ts:4-10`). API `.env`: all are present except the three Razorpay credentials. No web `.env*` file exists.
- VERIFIED: migrations `001_init.sql`, `002_auth_payments.sql`, `003_universal_booking.sql`; `schema_migrations(name, applied_at)` stores names only—no checksum (`apps/api/src/migrate.ts:4-13`). Live DB records all three. Live tables/columns, constraints, and indexes match the three migration files; no migration/schema mismatch was observed.
- VERIFIED: `photographer` occurrences: `apps/api/src/server.ts` 47; `booking-service.ts` 13; `seed.ts` 8; `auth.ts` 3; `migrate.ts` 1; SQL 001/002/003: 7/3/19; web route/layout/styles files: 2/3/5 and remaining named route files 1 each. Core model remains photography-named.

## Route inventory

| API route | Auth/validation | Web caller |
|---|---|---|
| POST `/v1/payments/razorpay/webhook` | raw Razorpay signature | none (provider) |
| GET `/health` | none | none |
| POST `/v1/auth/request-otp` | email, role | `/auth`, `/[slug]/book` |
| POST `/v1/auth/verify-otp` | email, role, 6 digits | `/auth`, `/[slug]/book` |
| POST `/v1/auth/logout` | session optional | none |
| GET `/v1/me` | session | none |
| GET `/v1/photographers/:slug` | public published profile | `/[slug]`, `/[slug]/book` |
| POST/PATCH `/v1/photographers`, `/me` | photographer session | no caller |
| POST `/v1/bookings` | client session, booking Zod body + idempotency header | `/[slug]/book` |
| GET `/v1/bookings/:id` | client or owner session | `/booking/[id]` |
| GET `/v1/dashboard` | photographer session | `/dashboard` |
| POST/PATCH `/v1/services`, `/v1/services/:id` | photographer session | no caller |
| POST `/v1/photographers/me/publish` | photographer session | no caller |
| GET `/v1/client/bookings` | client session | `/my-bookings` |
| PUT `/v1/availability/:date` | photographer session; body Zod | `/dashboard` |

VERIFIED: web routes are `/`, `/auth`, `/dashboard`, `/my-bookings`, `/booking/[id]`, `/[slug]`, and `/[slug]/book`. No web calls to nonexistent routes were found. The profile, service, publish, logout, and `/me` APIs have no UI caller.

## Baseline

| Command | Result |
|---|---|
| `pnpm.cmd --filter @bayana/api migrate` | PASS (0); live ledger already contained all migrations |
| `pnpm.cmd typecheck` | PASS (0) |
| `pnpm.cmd lint` | PASS (0) |
| `pnpm.cmd test` | PASS (0); one file, three money tests only |
| `pnpm.cmd build` | PASS (0); API compiled and Next production compilation completed |

Docker PostgreSQL was already running. A separate `bayana_test` database was created and migrated for authentication requests; production data was not used for tests.

## Sign-in reproduction and root cause

VERIFIED against API at `localhost:4002`, test DB, and a temporary local SMTP sink:

1. Fresh photographer OTP request: `202 {"ok":true}`. Verification: `200`, session cookie present. `/v1/me`: `200`. `/v1/dashboard`: `404` because no profile exists. Logout: `204`; session row was revoked.
2. Immediate request for a second photographer OTP after logout: `429`. The verified OTP row was consumed and no active session remained.
3. After the 60-second window, the same existing photographer requested and verified a new OTP: `202`, then `200`; cookie again present. Therefore persistent “cannot sign in again” is **not reproduced**; the immediate post-verification/re-login failure is reproduced.

**CONFIRMED root cause:** `requestOtp` cooldown includes consumed OTP rows: `apps/api/src/auth.ts:12` selects rows created in the last 60 seconds without `consumed_at IS NULL`. `verifyOtp` consumes the OTP at line 25. A user who logs out immediately after verification cannot request another code for up to 60 seconds. API presents this as a generic `429` (the Express request client did not expose the JSON response body), while the UI is built to display it.

Candidates: existing-email OTP rejection RULED OUT (same vendor re-login succeeds after cooldown); auth page register-only RULED OUT (same `/auth` request/verify flow works); cookie/CORS RULED OUT for localhost (Set-Cookie present and `/v1/me` succeeds); user insert conflict RULED OUT for same role; missing profile CONFIRMED as a separate dashboard `404`, not auth failure; stale cooldown CONFIRMED.

Customer-role collision probe is BLOCKED/INCONCLUSIVE: temporary SMTP capture did not reliably associate later generated codes with recipient. A direct known-row probe reached `429` due to test contamination. It must be rerun from a clean test database with a deterministic OTP helper in the test harness.

## AGENTS.md section 6 invariants

| Invariant | Status | Evidence |
|---|---|---|
| case-insensitive one user/email | PASS | `users.email citext UNIQUE`, `002_auth_payments.sql` |
| vendor password signup/sign-in | FAIL | OTP-only UI/API, `auth.ts:9-29`, `/auth/page.tsx:5` |
| customer OTP-only | PASS | booking page requests CLIENT OTP |
| OTP purpose/HMAC/atomic attempts | FAIL | role not purpose; SHA-256 not HMAC; attempts update not atomic condition, `auth.ts:6-25` |
| OTP expiry/single-use/cooldown | PASS | `auth.ts:12-25`; cooldown defect above |
| argon2id passwords | FAIL | no password storage/dependency |
| session token/cookie/revocation | PASS | `auth.ts:27-35`, `server.ts:24,30` |
| non-enumerating auth responses | FAIL | role conflict returns 409, `auth.ts:29` |
| server computes start/end + timezone library | FAIL | client supplies starts_at; no ends_at/timezone library, `booking-service.ts:11-31` |
| exclusion constraint overlaps | FAIL | only unique indexes, `001_init.sql`, `003_universal_booking.sql` |
| sole transition function | FAIL | `booking-service.ts:18` directly expires holds with `UPDATE bookings`, bypassing `transition` and a booking event |
| booking snapshots include service/price/duration/advance/terms | FAIL | no advance-rule or terms text snapshot, `003`, `booking-service.ts:31` |
| payment verified before confirmation | PASS | webhook transaction in `payments.ts:23-35` |
| published privacy/unguessable booking access | FAIL | booking UUID authorization is authenticated-only but no access token; public contact opt-in absent |

## Defects

### Critical

- VERIFIED — `apps/api/src/auth.ts:12`, `requestOtp`: consumed OTP blocks a new login for 60 seconds. Required fix: cooldown only active/unconsumed requests, with a focused logout/relogin test.
- VERIFIED — `apps/api/src/auth.ts:9-29`, `apps/web/app/auth/page.tsx:5`: vendor authentication has no password despite the required invariant. Required fix: phased credential schema and argon2id flow; prove registration and both sign-in methods.

### High

- VERIFIED — `apps/api/src/config.ts:7`, `payments.ts:9`: accepted payment modes are `disabled|razorpay`, not `disabled|test|live`; no key-mode validation. Required fix: explicit modes and startup checks.
- VERIFIED — `apps/api/src/server.ts:44`: committed `console.log`, no structured request logging/redaction.
- VERIFIED — `apps/api/src/server.ts:44` and catch blocks: inconsistent error shape; several handlers return strings such as `{error:"..."}` rather than the mandated object.
- SUSPECTED — slot concurrency permits interval overlap because only identical starts are unique; prove with concurrent different-start requests after interval scheduling is implemented.

### Medium/Low

- VERIFIED — service/profile/publish APIs are unreachable from web UI (route inventory above).
- VERIFIED — no auth, booking, payment, privacy, or database integration tests exist; only `apps/api/test/money.test.ts` runs.
- VERIFIED — migration tracking has no checksums (`migrate.ts:4-13`).

## Phase order

The planned order should change: Phase 1 must repair and test vendor authentication/session semantics before onboarding, availability, or payments. Add an isolated API integration-test harness first so OTP, cooldown, role collision, and cookies can be tested deterministically.
