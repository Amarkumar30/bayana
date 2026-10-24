# Bayana Phase 0 Audit (re-run)

Audit date: 2026-10-24. Branch `phase-0-audit`, created from `aa51855` with the uncommitted phase 2â€“5 work still in the working tree. It replaces the 2026-10-23 audit; that version is in git history. The audit compares the code against `docs/SPEC.md` Â§4, Â§8, Â§10, Â§11 and Â§12. **VERIFIED** means backed by command output or real HTTP calls against `bayana_test`. **SOURCE** means read from code only.

## 1. Inventory

- Workspace packages: `@bayana/api` (Express 5, pg, argon2, zod, razorpay, nodemailer), `@bayana/web` (Next 15.3, React 19) and `@bayana/shared` (zod-free helpers). There is no timezone library: the slot engine uses `Intl`.
- Root scripts: `dev`, `db:up`, `db:migrate[:test|:status]`, `seed:dev`, `build`, `test` (unit, then integration), `lint`, `typecheck`. `lint` is only `tsc --noEmit`; no linter is installed.
- API test scripts use cmd-only `set X=..&&` syntax and hardcode `localhost:5433`/`localhost:2525` (`apps/api/package.json`). They run on Windows but not on Linux CI.
- Git: 2 commits (`defc0df`, `aa51855`). The 42 changed or untracked paths are phase 2â€“5 work that was never committed. That includes migrations 005â€“010 and `backups/*.dump`, which is untracked and not ignored.
- Applied migrations (VERIFIED, `schema_migrations`):
  - `bayana` (dev) has **001â€“008** applied.
  - `bayana_test` has **001â€“010** applied.
  - 004â€“008 are therefore applied too and must also be treated as immutable, not just 001â€“003.

**Schema from 001â€“003.**
- `photographers`: slug citext unique, bigint `base_price_paise`, advance type and value.
- Per-day `availability`.
- `bookings`: status CHECK, `total_paise` and `advance_paise` with advance â‰¤ total, unique `idempotency_key`, and a partial unique index of one active booking per day.
- `booking_events`, `payments` (bigint amount, unique order id), `webhook_events` (PK provider event id), and `ledger_entries`, kept append-only by a trigger.
- 002 added `users` (citext unique email, role), `auth_otps` (role-bound, `code_hash`), `auth_sessions` (`token_hash` unique) and `audit_logs`.
- 003 added vendor profile and policy columns, `services`, `availability_slots`, booking snapshot columns, and a per-slot unique index.

**Changes in 004â€“010.**
- Migration checksums.
- Password, `otp_challenges` and `auth_tickets`.
- Rename to `vendors` and `VENDOR`.
- Categories.
- Service buffers and advance rule.
- Availability rules, exceptions and blocked periods.
- UTC ranges plus the btree_gist exclusion constraint.
- 009 drops the legacy day and slot indexes.
- `PENDING`, `access_token_hash` and `email_outbox`.

## 2. Sign-in bug (VERIFIED)

**Setup.** The API ran from the current tree on port 4100 with `NODE_ENV=test` against `bayana_test`, using throwaway secrets. Scripts were in the scratchpad, not the repo.

**Scenario A (fresh vendor):** signup â†’ logout â†’ `login/password` 200 â†’ `login/otp/verify` 200. **This works.**

**Scenario C/D (vendor verified earlier, before passwords existed):** this is a `users` row with role VENDOR and a NULL `password_hash`. All vendors created through the 002 OTP-only flow are in this state, and migration 005 added `password_hash` with no backfill or claim path.
- `POST /v1/auth/login/password` â†’ **401 `{"error":{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}}`**
- The UI's "Forgot password?" calls `POST /v1/auth/password/forgot` â†’ **404 `{"error":{"code":"NOT_FOUND","message":"Not found"}}`**
- The OTP path (`login/otp/verify`) returns 200, but the UI hides it behind "Use email code".

**Root cause**
1. `apps/api/src/auth.ts:46` rejects every user whose `password_hash` is NULL. Nothing gives these vendors a way to set a password.
2. `apps/web/app/auth/page.tsx:6` calls `/v1/auth/password/{forgot,verify,reset}`, but those routes are not registered in `apps/api/src/server.ts:44-52`.

**Earlier cause.** The 2026-10-23 audit traced the bug to a 60 s cooldown that counted consumed OTPs. That is fixed at `auth.ts:23`, which now filters on `consumed_at IS NULL`.

**Also observed**
- **CRITICAL:** `login/password` returns the argon2 `password_hash` in its JSON body. `auth.ts:46` spreads it into `user`, and `server.ts:47` sends it.
- Re-running "Create account" for an existing email silently replaces the password (201) and does not revoke existing sessions (`server.ts:46`, ON CONFLICT DO UPDATE).
- The 11th OTP in an hour for one email, across all purposes, returns 429 `OTP_RATE_LIMITED` "Please wait before requesting another code" (`auth.ts:24-26`). This is by design.

## 3. Requirement groups

| Group | Status | Evidence |
|---|---|---|
| AU | **FAIL** | Hash leak (`auth.ts:46`, `server.ts:47`). AU-02 fails for legacy vendors (Â§2). AU-07 reset is NOT BUILT; the UI calls missing routes. AU-08 and AU-10 are NOT BUILT. AU-09 has only a global 300/15 min limit plus OTP caps, with nothing per endpoint on `login/password`. AU-01, AU-03 and AU-05 (purpose column, atomic attempts â‰¤5, 10 min, single use, 60 s cooldown) and AU-06 cookie flags are implemented, but no HTTP-level tests cover them. |
| VN | **PARTIAL** | VN-02: slug is 3â€“30 chars with a reserved list (`shared/src/index.ts:1-4`); the spec says 3â€“40. VN-03: published-only queries return the same 404 body (`server.ts:54`). VN-05: contact fields are excluded from the public select. Publish checks the legacy `availability` table rather than `availability_rules` (`server.ts:75`), so a TIMED-only vendor with weekly rules cannot publish. VN-04 and VN-06 are NOT BUILT. Nothing in this group is tested over HTTP. |
| SV | **PARTIAL** | SV-01 and SV-02: Zod plus DB CHECKs, integer round-half-up (`shared/src/index.ts:23`), with unit tests. A FIXED advance above the price is not rejected at create or update (`server.ts:72-73`); it only fails at publish, or with a 500 at hold time. SV-03 (cancellation tiers) and SV-04 are NOT BUILT. |
| AV | **PARTIAL** | Rules, exceptions and blocked periods exist (008), and DST unit tests exist. Overlapping weekly windows are not rejected (`server.ts:32`). Notice and window are hardcoded at 2 h / 90 d (`server.ts:33`, `booking-service.ts:24`). Public slots ignore PENDING bookings (`server.ts:33`) while holds count them (`booking-service.ts:20`). |
| BK | **FAIL** | BK-07: status is written outside `transitionBooking` at `booking-service.ts:35`, `booking-service.ts:59` and `server.ts:68`. `transitionBooking` (`booking-service.ts:7-12`) takes no row lock (no FOR UPDATE) and has no `PENDING` entry, so PENDING bookings can never be confirmed or cancelled. BK-04: the constraint exists, but 23P01 is not mapped to `SLOT_TAKEN` and becomes a 500. BK-06: snapshots exist but there is no terms hash. BK-01, BK-02, BK-05 and BK-08 are implemented (token is 32 random bytes, stored hashed, wrong token gets 404). |
| PY | **FAIL** | PY-03: there is no checkout-signature verify route. PY-04: the webhook uses the raw body, timing-safe HMAC and event-id dedup, but a mismatch throws a 409, which rolls back the dedup row instead of flagging (`payments.ts:33`). PY-05: zero-advance bookings are inserted as CONFIRMED with no payment row (`booking-service.ts:44`). PY-06 is NOT BUILT. PY-01 lacks `LIVE_PAYMENTS_ACK` (`config.ts:22-26`). `any` appears at `payments.ts:13` and `payments.ts:25`. |
| CT | **NOT BUILT** | Only vendor-level free-text terms, a JSON `terms_snapshot` and `terms_accepted_at` exist. There is no template, no variables, no SHA-256 hash, and no acceptance evidence (IP, user agent, email). |
| NT | **FAIL** | NT-01: the `email_outbox` rows (`booking-service.ts:51-52`) are never sent. `processEmailOutbox` (`email.ts:4`) has no caller, and neither does `sweepExpiredBookings`. OTP mail is sent synchronously inside the DB transaction (`auth.ts:30`), so an SMTP failure fails the request. NT-02 is partial and NT-03 is NOT BUILT. |

## 4. Specific checks

| Check | Result |
|---|---|
| DB-level overlap guard | **YES.** `bookings_no_overlapping_active_periods` EXCLUDE USING gist (`010_customer_booking.sql:8-9`), with the vendor row locked FOR UPDATE (`booking-service.ts:30`). Gap: legacy active bookings with a NULL `occupied_range` lost their day guard when 009 dropped the old indexes. |
| Status changed in more than one place | **YES.** There are 4 UPDATE sites (above), plus initial INSERTs with CONFIRMED or PENDING (`booking-service.ts:47`). |
| Money in integer paise | **YES.** Every money column is `bigint` `*_paise`; rupee strings are parsed exactly (`shared/src/index.ts:5`). |
| Sessions and OTPs hashed | **YES.** Sessions use SHA-256(secret:token) (`auth.ts:7`). OTPs use HMAC(pepper, code) (`auth.ts:8`), but the hash is not bound to email or purpose as SPEC Â§12.2 requires. `OTP_PEPPER` falls back to `SESSION_SECRET` outside production (`config.ts:22`). |
| Hardcoded secrets | **None found.** `.env` is gitignored. The test fixture `rzp_live_secret_value` is fake. |
| Hardcoded localhost | **YES.** `?? "http://localhost:4000"` appears in 7 web files (for example `apps/web/app/auth/page.tsx:4`). `WEB_ORIGIN` defaults to localhost (`config.ts:7`). Test scripts point at a localhost DB and SMTP, which is acceptable for tests. |
| Local disk writes | **None.** The only `fs` use is `migrate.ts:1`, which reads only. |
| Other | `server.ts` is a single 34 KB file of one-line handlers. Errors carrying a status but no code return `INTERNAL_ERROR` with a 4xx. 20 tests in total, with no HTTP-level auth, booking or payment tests. |

## 5. Recommendations

| Area | Call | Reason |
|---|---|---|
| Auth | REFACTOR | The primitives are sound (argon2id, HMAC OTP, hashed sessions). Fix the hash leak, add the reset and claim-password flow, revoke sessions on credential change, and add HTTP tests. |
| Vendor profile and public page | KEEP | It mostly meets the spec. Fix the publish availability check and the slug length. |
| Services | KEEP | Validation and money math are correct. Add a FIXED â‰¤ price check and cancellation tiers. |
| Availability engine | REFACTOR | The engine is reasonable. Unify the busy-period query, make notice and window configurable, reject overlapping rules, and consider a timezone library. |
| Booking | REFACTOR | Keep the exclusion constraint and the snapshots. Make `transitionBooking` the only status writer, with FOR UPDATE and the full Â§10 state table. |
| Payments | REWRITE | The verify route, late-payment handling and mismatch flagging are missing, and the module is untyped. It is small enough to redo against Â§11. |
| Contract and terms | REWRITE | Effectively not built. It needs template, hash and evidence tables. |
| Notifications | REFACTOR | The outbox table is right, but it needs a worker or tick, and OTP mail has to come out of the transaction. |
| API structure | REFACTOR | Split `server.ts` into route modules and a central typed error helper so reviews and tests are practical. |
