# Bayana deployment-readiness review bundle

Generated 2026-10-25 from branch `phase-10-hardening` at commit `23dd988` (working tree clean apart from an untracked `.vscode/` when collection started). No source files were changed to produce it. While it was being generated, someone else working in the repo modified `apps/api/test/integration/auth.test.ts` (AU-04 timeout raised to 20 s) and `scripts/signoff-local.mjs` (Mailpit code de-duplication). Those edits are uncommitted and not by this bundle, and the section 7 runs may have overlapped them.

**Redaction:** env variables are shown by name with `set` / `missing` only. Credentials in URLs, Razorpay keys, Google client secrets, CI throwaway secret values and long random strings were replaced by `[REDACTED…]` in a final automated pass. Embedded files are fenced with `~~~~`.

**Notes on what exists:**
- `docs/DEPLOY.md`, `render.yaml` and `.github/workflows/backup.yml` are **not in this repo**. They exist only as **uncommitted** files in the separate git worktree `C:\dev\bayana-phase11` (branch `phase-11-deploy-prep`, based on Phase 9 commit `40f974c`, which predates Google sign-in and Phase 10). They are included below and labelled. The plan in HANDOFF.md is to move them onto a new `hosting-ready` branch.
- This repo has `docs/DEPLOYMENT.md` (9 lines, **stale**: it names `API_ORIGIN` and `NEXT_PUBLIC_API_ORIGIN`, which the code does not read).
- `CLAUDE_CODE_PHASES.md` is at the repo root, not under `docs/`.
- There is no `vercel.json`, no `.nvmrc` and no `engines` field. The root `package.json` pins `packageManager: pnpm@10.13.1`, and CI and both Dockerfiles use Node 22.

---

## 1. Handoff, progress and deploy docs

### docs/HANDOFF.md
~~~~markdown
# Handoff (2026-10-25) — read this first, then docs/PROGRESS.md "Session handoff 3"

**State:** branch `phase-10-hardening`, last code commit `3220420` plus one docs commit on top; git clean after it. History is one straight line from `main` (`defc0df`, the only commit on GitHub). Nothing pushed. Phases follow docs/CLAUDE_CODE_PHASES.md (SPEC 19.2 numbers them differently). `bayana_dev` and `bayana_test` both have migrations 001–019.

## Decisions not obvious from the code
- **Status changes:** only `transitionBooking` (apps/api/src/booking-transition.ts) writes `bookings.status`, enforced by a grep test (test/unit/status-writes.test.ts). Same-status events (reschedules) use `recordChange`. Double booking is stopped by the vendor lock `pg_advisory_xact_lock` plus the exclusion constraint `bookings_no_overlap`.
- **Append-only evidence:** triggers reject UPDATE/DELETE for every role on `booking_events`, `booking_contracts`, `audit_logs`, `consents` and `ledger_entries`. The ledger allows exactly one update: setting `reason` to `[personal details removed]` (erasure, migration 019).
- **`bayana_app` role:** a NOLOGIN role without rewrite rights. The API still connects as `bayana`; production should connect as a member of `bayana_app` (open).
- **Column renames:** 013 renamed `starts_at_utc`→`starts_at`, `occupied_*`→`block_*`, and the old `starts_at` (time)→`local_start_time`. 015 renamed `payments.raw_event`→`raw` and `webhook_events.provider_event_id`→`event_id`. Never edit an applied migration; add the next number.
- **Payments:** `PAYMENT_MODE` is `disabled|test|live`; live is refused in this build. An `rzp_live_` key aborts startup unless the mode is live. `PAYMENT_PROVIDER=fake` is allowed only with NODE_ENV=test.
  - CONFIRMED requires a verified payment row (offline counts).
  - A late payment re-claims the slot, or goes to EXPIRED_PAID with an automatic full refund.
  - A vendor cancellation refunds 100%. Refund previews and refunds use the same `refundPreview`.
- **Email and jobs:** all email goes through `email_outbox`. Codes, payments and confirmations are priority 0, sent right after commit (`kickUrgent`). Backoff is 1, 5, 30 and 120 minutes, then failed. OTP bodies are blanked once sent.
  - No timers: GitHub Actions call `POST /internal/jobs/tick` (every 10 min) and `/nightly` with `Bearer TICK_SECRET`. Both stay off until the repo variable `JOBS_ENABLED=true`. Every run is in `job_runs`.
- **Auth: Google + email code is BUILT** (branch auth-google-signin). The password is optional. Google links by subject, then by email, never a second user. No Google tokens are stored. The sign-in state is single-use in `oauth_login_states`. Google is off without `GOOGLE_CLIENT_ID`.
- **Admin:** `users.is_admin` is set only by SQL, plus TOTP per session for 12 hours. The TOTP secret is encrypted with a key derived from `SESSION_SECRET`. Rotating `SESSION_SECRET` breaks sessions, booking links, admin TOTP and in-flight Google sign-ins.
- **CSP:** account pages render per request with a nonce. The cached public page `/[slug]` and static pages keep script `'unsafe-inline'` (cached HTML can't carry a nonce). `style-src 'unsafe-inline'` stays.
- **Performance:** fonts use `display: optional`, CSS is inlined, and public links don't prefetch. The Lighthouse gate uses the measured LCP (median of 3, about 1.4 s); the simulated estimate (about 3.0 s) is printed too.
- **Privacy:** erasure removes names, emails, phones and notes, and keeps money rows. Contracts are kept as legal evidence. Legal pages are drafts that need lawyer review.

## Open bugs and limitations
- **Phase 10 sign-off not done:** `docs/LOCALHOST_SIGNOFF.md` is not written, and `scripts/signoff-local.mjs` was written but never run.
- **Phase 11 deploy prep is uncommitted** in the worktree `C:\dev\bayana-phase11` (based on Phase 9; render.yaml, docs/DEPLOY.md, RESTORE.md, Neon compatibility, a backup workflow). Agreed plan: bring it onto a new branch `hosting-ready` from phase-10. Moving this repo breaks that worktree's link; run `git worktree repair`.
- **Untested:** a real Razorpay Checkout payment and the webhook through a tunnel (`RAZORPAY_WEBHOOK_SECRET` is empty); a real Google round trip; Brevo SMTP; GitHub Actions (never pushed).
- **Flaky under machine load:** the 5-second timeouts in apps/api/test/integration/dashboard-admin.test.ts and the AU-04 timing test in auth.test.ts.
- **Not built:**
  - CT-04 contract PDF; receipts show "INR" rather than ₹ (apps/api/src/payments/receipt.ts).
  - Customer-side reschedule (BK-09).
  - A `customers` table.
  - `.ics` email attachments.
  - A QR code for TOTP setup.
  - Payout and KYC settings.
- **Known quirks:**
  - apps/api/src/seed.ts writes legacy availability (avoid `seed:dev`).
  - Manual bookings also email the vendor.
  - Screenshot baselines are Windows-only.

## What you must do by hand (names only, never values)
- **Env files** (copy them when moving, not in git):
  - `apps/api/.env`: DATABASE_URL, DATABASE_URL_TEST, DATABASE_URL_DIRECT (production), SESSION_SECRET, OTP_PEPPER, TICK_SECRET, WEB_ORIGINS, SESSION_COOKIE_DOMAIN, TRUST_PROXY, APP_ENV, EMAIL_TRANSPORT, SMTP_URL, EMAIL_FROM, OPS_EMAIL, PAYMENT_MODE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.
  - `apps/web/.env.local`: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID, NEXT_PUBLIC_SENTRY_DSN.
- **Rotate** the Google client secret (it was pasted into a doc, removed before commit) and the Brevo SMTP key (printed in an earlier session).
- **Razorpay:** start a tunnel (Cloudflare Tunnel or zrok; Razorpay rejects ngrok), create the test webhook (5 events) and set its secret. Then complete one Checkout payment (`pnpm.cmd payments:smoke`, docs/PAYMENTS_LOCAL.md).
- **Google:** register the redirect URI, add test users, publish the consent screen (docs/GOOGLE_SETUP.md).
- **GitHub:** repo variable JOBS_ENABLED; secrets API_URL and TICK_SECRET.
- **Email domain:** SPF, DKIM and DMARC records for the Brevo sending domain.
- **Before any migration on dev:** back up (command below).

## Next step
1. Finish Phase 10: write docs/LOCALHOST_SIGNOFF.md, start `pnpm.cmd dev`, run `pnpm.cmd signoff:local`, fix failures, run the gates, commit.
2. Then create branch `hosting-ready`, bring in the C:\dev\bayana-phase11 changes, adapt them to Google sign-in and Phase 10, test, and push only that branch. Never push to or merge into `main` without asking.
Use the starter prompt the last session printed (it begins "Read docs/HANDOFF.md").

## Commands (PowerShell, always pnpm.cmd)
- Run: `pnpm.cmd db:up` · `pnpm.cmd dev` (web 3000, API 4000, Mailpit 8025) · `pnpm.cmd run doctor`
- Test: `pnpm.cmd typecheck` · `lint` · `test` · `build` · `test:visual` · `test:e2e` (one at a time, dev stopped; set `$env:DATABASE_URL_TEST` first) · `perf:lighthouse` · `signoff:local`
- Migrate: `pnpm.cmd db:migrate` (dev) · `pnpm.cmd db:migrate:test`
- Backup: `docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/dev.dump bayana_dev` then `docker cp bayana-postgres-1:/tmp/dev.dump backups\bayana_dev-<date>.dump`
- Restore: `docker cp backups\<file>.dump bayana-postgres-1:/tmp/r.dump` then `docker exec bayana-postgres-1 pg_restore -U bayana -d bayana_dev --clean --if-exists --no-owner /tmp/r.dump`
- Jobs: `pnpm.cmd jobs:tick` · `pnpm.cmd jobs:nightly` · `pnpm.cmd payments:reconcile`
- Security: `pnpm.cmd audit --audit-level=high` · the gitleaks command in docs/RUN_LOCAL.md
~~~~

### docs/PROGRESS.md
~~~~markdown
# Progress

## Phase 1 foundation — 2026-10-23

- Added environment validation, payment key-mode checks, OTP pepper support, and email transport selection.
- Added test database creation, migration invocation, unit/integration script split, and test factories.
- Hardened migration tracking with checksums, transactions, advisory locking, legacy checksum backfill, and status output.
- Added structured logging/redaction, request IDs, liveness/readiness routes, centralized error handling, and a 404 handler.
- Made the development seed idempotent and development-only.
- Remaining Phase 1 gate results are recorded in the final report after the full command run.

## Phase 2 authentication — in progress

- Added migration 005 for password credentials, purpose-bound OTP challenges, single-use tickets, session activity/freshness, and auth events.
- Added Argon2id password hashing and new signup, password, OTP-login, reset, session, and CSRF endpoint plumbing.
- Replaced the former passwordless `/auth` screen; booking OTP compatibility remains available for customer verification.
- Typecheck, lint, existing tests, and build pass. Required end-to-end auth integration scenarios still need implementation before Phase 2 may be marked complete.

## 2026-10-23 — Phase 3 domain alignment (in progress)

- Added forward-only `006_domain_alignment.sql`: photographers/vendors and owner-column renames, normalized categories, role migration, and vendor slug history.
- Fresh backup restored into `bayana_phase3_scratch_20261023`; 005 and 006 applied and preserved observed row counts.
- `bayana_test` accepted migration 006.
- Remaining: complete API/web route and role rename, slug-history redirect handling/tests, documentation cleanup, and full gates.

## Phase 4 vendor onboarding and publication — 2026-10-23

- Added vendor-owned profile, service CRUD, publication and unpublication routes plus the forward-only onboarding migration.
- Service prices use exact rupee-string parsing; saved service advance rules drive public advance and remaining balance amounts.
- Public pages now render saved profile, service and policy values only, with identical Next.js 404 handling for unavailable slugs.
- Dashboard saves drafts, edits services, shows onboarding progress, and has preview/copy-link controls.
- Added unit coverage for money, slug, advance, and precise publish-checklist behavior.
- `bayana_test` migration and the focused database integration suite pass; run the full UI journey manually before release.

## UI refinement — 2026-10-23

- Refreshed the web visual system around a calm, trust-forward client flow: editorial typography, warm surfaces, accessible focus states, responsive cards, and a guided vendor workspace.
- Reworked the landing-page narrative to make service setup and secure booking benefits immediately clear.
- No backend/API behavior changed; run a visual browser review of public, dashboard, authentication, and booking views before release.

## Phase 5 availability - 2026-10-23

- Added weekly rules, date exceptions, blocked periods, UTC booking intervals, occupied ranges, and service/policy snapshots in migrations 008 and 009.
- Public availability now supplies rate-limited month summaries and UTC slots; holds re-evaluate a slot inside their transaction and persist its buffered occupied range.
- Added DST/full-day/buffer unit coverage and a direct-SQL GiST exclusion-constraint integration test; `bayana_test` accepted both migrations.
- Public booking now uses a keyboard-navigable month grid and slot list with timezone/loading/empty/error states.
- Remaining: add endpoint-level concurrent block-versus-book race coverage and complete an interactive mobile/desktop dashboard calendar review.

## Phase 0 re-audit - 2026-10-24

- Re-audited the current working tree, including the uncommitted phase 2-5 work, against SPEC §4, 8, 10, 11 and 12. Replaced docs/AUDIT.md. No source files changed.
- Sign-in bug (verified on bayana_test): vendors created before migration 005 have no password. Password login returns 401 (auth.ts:46), and the UI's reset calls /v1/auth/password/* routes that do not exist (404). OTP login works.
- CRITICAL: POST /v1/auth/login/password returns password_hash in its response (auth.ts:46, server.ts:47). Fix this first.
- BK-07 fails: 3 status UPDATEs outside transitionBooking, and PENDING has no transitions. The email outbox is never processed. Payment verify, late-payment handling and CT are not built.
- Migrations 001-008 are applied on the dev DB and 001-010 on test. Treat all of them as immutable. 005-010 and backups/ are still untracked in git.
- Gates: typecheck 0, lint 0 (tsc only), test 0 (20 tests, none at HTTP level), build 0.
- Next: commit the phase 2-5 work, then fix the auth defects (hash leak, reset and claim-password, HTTP tests) before any new phase.

## Auth hotfix: password hash leak - 2026-10-24

- passwordLogin (apps/api/src/auth.ts:46) now returns only id, email and role, so POST /v1/auth/login/password no longer sends password_hash.
- Added test/integration/password-login.test.ts covering the response fields and an identical 401 for wrong password and unknown email. All gates pass.
- Not committed: auth.ts also holds the uncommitted phase 2 rewrite, so commit it with that work. Still open: reset routes, a way for legacy vendors to set a password, session revocation on re-signup.

## Phase 1 foundation (v2) - 2026-10-24

- Branch phase-1-foundation-v2 on top of 680707c, which commits the previously uncommitted phase 2-5 work as unreviewed WIP.
- API config: Appendix A names (WEB_ORIGINS, DATABASE_URL_DIRECT/_TEST, TRUST_PROXY, LIVE_PAYMENTS_ACK). Exits 1 naming variables, never values. WEB_ORIGIN is still accepted outside production.
- Web: env-schema.ts/env.ts replace the 7 localhost fallbacks. next build fails fast when NEXT_PUBLIC_API_URL or NEXT_PUBLIC_SITE_URL is missing.
- API: app.ts and server.ts split, helmet, CORS allowlist, Pino log() with key redaction, errors.ts central handler (generic 5xx; legacy 4xx get REQUEST_FAILED), /ready 503.
- DB: migration-runner.ts (checksum check before applying), migrate.ts on DATABASE_URL_DIRECT, db:create helper, vitest setup guard for _test.
- Docker: compose with bayana_dev, an init script for bayana_test, Mailpit. Non-root multi-stage API image, built and smoke-run locally. CI has a postgres service.
- Gates: typecheck, lint, test (45 tests) and build all exit 0. CI is not run yet (needs a push).
- User action: in apps/api/.env set PAYMENT_MODE=disabled (currently "razorpay", which fails startup), add DATABASE_URL_TEST, rename WEB_ORIGIN to WEB_ORIGINS. Create apps/web/.env.local.

## Design system (user phase 2) - 2026-10-24

- Branch phase-2-design-system, on top of phase-1-foundation-v2. Look and layout only: every fetch, handler and request body in the working pages is unchanged.
- Tailwind v4 tokens in apps/web/app/globals.css (palette, dark mode via prefers-color-scheme or data-theme, 12-48 type scale, 10/8px radii, 44px targets, reduced motion). Inter for UI, Fraunces for headlines. styles.css removed.
- components/ui: Button, Input, Select, Textarea, Checkbox, Field, Switch, Dialog/Sheet, Toast, Tabs, Card, Badge/StatusBadge, Money, Table, Skeleton, EmptyState, Stepper, DatePicker, Avatar, Notice. Select and Checkbox are styled native controls so forms keep working.
- Route groups (site), (auth) and (public) plus a dashboard shell. URLs are unchanged. Availability moved to /dashboard/availability.
- Preview skeletons with a "Preview: not connected yet" banner and noindex. ?state=loading|empty shows those states. /design returns 404 in production (verified with next start).
- Playwright (pnpm.cmd test:visual, not in CI): screenshots of /design, /, /auth and /dashboard at 375 and 1280, plus overflow, labels, touch targets, focus, console errors and keyboard. Baselines are Windows-only.
- Still open: the GET /v1/bookings/:id response has no balance_due_paise (the page shows NaN), and blocked-period datetime-local values fail the API's datetime check. Both predate this phase.

## Phase 3 auth - 2026-10-24

- Branch phase-3-auth, a refactor as the audit recommended. Migration 011_auth.sql only expands: users.email_normalized, plus new sessions and otp_codes tables. Live auth_sessions rows are copied over. Old tables are unused but kept.
- apps/api/src/auth.ts: OTP HMAC is bound to email and purpose. Attempts are counted atomically in their own statement, so a failed request can't roll them back. Codes are single use, with a 60 s resend cooldown, 10/h per email and 30/h per IP. Passwords use argon2id (no bcrypt fallback). Sessions slide for 30 days with a 90-day cap, rotate on every sign-in and are revocable.
- apps/api/src/auth-routes.ts: /v1/auth otp/request, signup, login (password or code), password/reset, logout, me, and GET/DELETE sessions. Every route has per-IP and per-IP+email limits (429 with Retry-After). The old multi-step routes are removed.
- Enumeration: known and unknown emails get the same status and body, a dummy argon2 verify and an OTP row. Emails are sent after the response.
- Legacy vendors with no password can sign in by code and set a password by signup or reset.
- Web: /login (tabs), /signup (two steps), /forgot, lib/api.ts with human error messages, /auth redirects to /login, and Settings › Security lists and revokes sessions.
- Tests: 25 HTTP tests cover AU-01..AU-09 (mutation-checked on AU-07), plus 18 Playwright auth UI tests. Integration runs use TRUST_PROXY=1.
- Not done: AU-10 admin second factor (P1). Migrations 009-011 are not applied to the dev DB; run pnpm.cmd db:migrate after a backup.

## Fix local setup - 2026-10-24

- Branch fix-local-setup, from phase-3-auth. Setup tooling only; no Phase 4 work.
- Env errors list every problem at once: the variable, its allowed values, and the file to edit. Values are never echoed. Rules live in apps/api/src/config-schema.ts; the web equivalent is webEnvProblems in apps/web/env-schema.ts.
- apps/api/.env.example (new) and apps/web/.env.example now have safe local placeholders. The root .env.example points to them.
- pnpm.cmd setup:env (scripts/setup-env.mjs) creates missing files with an exclusive write, so existing files are never overwritten. It generates SESSION_SECRET and OTP_PEPPER in new files and lists what still needs a value.
- pnpm.cmd run doctor (scripts/doctor.mjs) needs `run`, because `pnpm doctor` is a pnpm built-in. Read-only checks: tools, env files, database server, the _dev and _test databases, pending migrations, ports.
- db:migrate prints pending migrations first, then refuses unless the database name matches NODE_ENV (_dev, _test, neither in production). The refusal includes PowerShell-safe backup and restore steps.
- Tests: env messages (API and web), the database-name guard, and setup:env never overwriting. Gates all exit 0. Playwright was not re-run (only env-schema changed on the web side).
- User state (from doctor): apps/api/.env points at "bayana" and lacks DATABASE_URL_TEST, apps/web/.env.local is missing, and port 4000 is in use. No migrations were applied.

## Phase 4 vendor setup - 2026-10-24

- Branch phase-4-vendor-setup from fix-local-setup. Migration 012 only expands: vendor min_notice_minutes and max_advance_days, service terms_template and cancellation_tiers, a NOT VALID fixed-advance-within-price check, and an availability_overrides table copied from availability_exceptions (now unused).
- @bayana/shared now has zod. Slug: 3-40 characters, larger reserved list. Advance: round half up, never above price. Tier and terms-template validation, IANA time helpers (formatter cached), and the service, availability and profile schemas.
- vendor-routes.ts: one requireVendor ownership check covers profile, booking window, checklist, services CRUD and reorder, rules (PUT and POST), overrides, blocked periods, publish and unpublish. public-routes.ts: unknown and unpublished slugs give a byte-identical 404, and contact details appear only when the vendor opts in.
- Slot engine: overrides (whole-day block clears, open adds, partial block cuts), notice in minutes, per-vendor window. A single loader is shared by the public routes and createHold.
- UI: working /onboarding wizard, /dashboard/services and /dashboard/availability; the overview shows the 3-step checklist; the blocked-period timezone bug is fixed.
- Tests: 70 unit (including 300 seeded property runs and DST cases for Kolkata, London and New York), 47 integration (A vs B on every vendor route, enforced by reading the router's route table), and 123 Playwright, all green twice.
- Fixed: zod versions differed (3.24 vs 3.25), which broke instanceof ZodError and returned 500s; all packages are now on ^3.25.76.
- Next: Phase 5 booking engine. Decided: a bayana_app role plus a trigger on booking_events, and renaming columns to the spec's starts_at/ends_at/block_* after a backup.

## Session handoff - 2026-10-24 (read this first)

History is one straight line on phase-4-vendor-setup. Each phase branch points at its own commit. Nothing is pushed: origin/main is still defc0df.
- Phase 0 audit: phase-0-audit 4c2d705. docs/AUDIT.md re-audit. Left: audit items owned by later phases.
- WIP snapshot: phase-2-auth-hotfix 680707c. Older uncommitted phase 2-5 work plus the password_hash leak fix. Left: nothing (superseded).
- Phase 1 foundation: phase-1-foundation-v2 93082cf. Config, Pino, error handler, migration runner, Docker/Mailpit, CI, API Dockerfile. Left: CI never run (needs a push).
- Phase 2 design system: phase-2-design-system 141281b. Tokens, components, layouts, previews, /design, Playwright. Left: screenshot baselines are Windows-only and not in CI.
- Phase 3 auth: phase-3-auth f16574c. otp_codes, sessions, /v1/auth routes, login/signup/forgot UI, AU-01..09 tests. Left: AU-10 admin second factor.
- Fix local setup: fix-local-setup d1a0da7. Actionable env errors, setup:env, `pnpm.cmd run doctor`, guarded db:migrate.
- Phase 4 vendor setup: phase-4-vendor-setup fc0ec12. Overrides, booking window, shared schemas, ownership router, onboarding UI. Left: the items below.
Facts for the next session:
- The dev database is still named "bayana", and migrations 009-012 are not applied to it. Back it up first (README has PowerShell-safe commands), move it to bayana_dev, then run db:migrate.
- Phase 5 decisions already made: a bayana_app role plus a trigger make booking_events append-only. Rename the booking columns to the spec's starts_at, ends_at, block_start and block_end. The rename is destructive: give the user backup commands first.
- The time-off route (POST /v1/vendor/availability/blocked-periods) still sets booking status directly; Phase 5 must route it through transitionBooking.
- Seed data (apps/api/src/seed.ts) still writes the legacy availability table, which no longer drives slots.
- Open bug: the customer booking page shows NaN because GET /v1/bookings/:id has no balance_due_paise.
- Stale branch names phase-2-authentication, phase-3-domain-alignment and phase-4-vendor-onboarding point at aa51855 and have no commits of their own.

## Phase 5 Booking engine - 2026-10-24 (branch phase-5-booking-engine)
- Migration 013_booking_engine.sql (DESTRUCTIVE renames; applied to bayana_test only): starts_at_utc/ends_at_utc -> starts_at/ends_at, occupied_* -> block_start/block_end, legacy `starts_at time` -> local_start_time; NULL legacy times backfilled (block range, else vendor-local whole day); bookings_no_overlap + bookings_block_valid exactly as SPEC 8.3; idempotency unique per (vendor_id, key); advance >= 0.
- booking_events append-only: bayana_app NOLOGIN role (no UPDATE/DELETE/TRUNCATE) plus triggers that reject them for every role; new meta jsonb; created_at defaults to clock_timestamp().
- src/booking-transition.ts is the only status writer: transitionBooking (FOR UPDATE, SPEC 10 table + guards, event row), recordCreated, lockVendorSchedule (pg_advisory_xact_lock), expireOverdueHolds. Unit test greps src for any other UPDATE bookings SET status.
- createHold: vendor lock -> idempotency -> lazy expiry -> engine re-check -> insert HELD (23P01 -> SLOT_TAKEN) -> HELD->PENDING (offline advance / nothing to pay) -> CONFIRMED when advance is 0. Engine misses are also SLOT_TAKEN (was SLOT_UNAVAILABLE). Response no longer includes hashes.
- Payments: checkout order moves HELD->PENDING; webhook requires PENDING and confirms with payment_id. Time-off route takes the same vendor lock and expires through transitionBooking. GET /v1/bookings/:id returns balance_due_paise (NaN bug fixed).
- Tests: 20-way race x10 and block-vs-book x10 pass (plus 3 extra file runs); idempotency, state table, row lock, sweep, append-only, privileges, BK-08.
- Left: apply 013 to dev after backup (see report); API still connects as `bayana`, so connect production runtime as a bayana_app member; customers table not created (bookings snapshot client fields); seed.ts still writes the legacy availability table; tick endpoint (POST /internal/jobs/tick) not wired (Phase 7).
- Local runs need DATABASE_URL_TEST in apps/api/.env and NEXT_PUBLIC_* in apps/web/.env.local (I set them per shell only).

## Phase 6 Public experience - 2026-10-24 (branch phase-6-public-experience)
- API: hold and acceptance split (SPEC 5.5). POST /v1/bookings now creates HELD (15 min) and returns the private token once; POST /v1/bookings/:id/accept {terms_hash} re-renders the contract, requires the same SHA-256, stores it, then HELD->PENDING (offline advance, hold extended to REQUEST_HOLD_HOURS) or ->CONFIRMED (no advance) or creates the Razorpay order (test mode). Errors: HOLD_EXPIRED, TERMS_CHANGED.
- Migration 014_booking_contracts.sql (additive): frozen body, sha256, accepted_at, verified email, IP, user agent; UPDATE/DELETE/TRUNCATE rejected by trigger. src/contract.ts renders terms with booking values (shared renderTerms, tiersInWords).
- booking-routes.ts: GET /v1/bookings/:id (token header X-Booking-Token or ?t=, customer or vendor) returns timeline, contract or preview, payments, refund preview, payments_enabled; POST /:id/cancel (customer only) records refund owed on the event. Public vendor JSON has payments_enabled.
- Web: /<slug> ISR (revalidate 300, error boundary when no cache), OG/Twitter tags, about, prices, FAQ, sticky Book. /<slug>/book six-step stepper (date strip + time chips, viewer-time hint, OTP then hold with countdown, key terms above the fold, full contract expandable, honest disabled-payments message, Razorpay Checkout only in test mode, ?resume=). /b/[id] real page; /booking/[id] redirects there. /waking polls /health every 3 s. lib/api.ts: 10 s first-call timeout and unshaped 502/503 -> /waking; shared bookingErrorCopy.
- EMAIL_TRANSPORT gains "capture" (test-only, default under NODE_ENV=test); API test scripts pin it.
- New: pnpm.cmd test:e2e (playwright.live.config.ts): real API on bayana_test + Mailpit + next dev, 375 px: full booking with payments disabled; two browsers racing for one slot.
- Left: vendor "Record offline advance" is a disabled stub; vendor cancel (BK-11), refunds issuing, PDF contract (CT-04), receipts and Razorpay verify are the payments phase. test:e2e and test:visual both use apps/web/.next, so never run them at the same time.

## Phase 7 Payments, test mode only - 2026-10-24 (branch phase-7-payments)
- Config: keys may stay set (unused) while PAYMENT_MODE=disabled; any rzp_live_ key outside live and rzp_test_ in live abort boot; every payment path refuses live (PAYMENT_LIVE_REFUSED). PAYMENT_PROVIDER=razorpay|fake (fake only under NODE_ENV=test). API test scripts blank the RAZORPAY_* vars, so CI needs no keys or network.
- src/payments/: PaymentProvider interface, RazorpayProvider (SDK + own HMAC/timing-safe checks), FakeProvider, runtime (mode/provider, test override), service (orders, verify, applyCapturedPayment, offline payments, refunds), webhooks, reconcile, receipt (pdf-lib). Old src/payments.ts removed.
- Migration 015_payments.sql (RENAMES payments.raw_event->raw, webhook_events.provider_event_id->event_id; back up first): lowercase payment statuses, provider/kind/currency/method/note/verified_at, refunds table, webhook review columns, ledger channel, append-only audit_logs, vendors.gstin.
- Flow: accept moves HELD->PENDING; POST /v1/bookings/:id/payment-order (reuses the open order) and /payment-verify; POST /webhooks/razorpay (raw body, before express.json; old /v1/payments/razorpay/webhook removed). Late payment re-claims (EXPIRED->CONFIRMED) or auto-refunds (EXPIRED->EXPIRED_PAID). CONFIRMED needs a verified payment row (PY-05). Vendor POST /v1/vendor/bookings/:id/offline-payments. Receipts GET /v1/bookings/:id/receipts/:paymentId. enqueueEmail() replaces raw outbox INSERTs.
- Web: PaymentPanel (Checkout, dismiss/failure/retry copy, success only on server CONFIRMED) in the stepper and on /b/[id]; vendor offline-payment form on /b/[id]; receipts and refunds listed; optional NEXT_PUBLIC_RAZORPAY_KEY_ID (rzp_test_ only); first CSP (self, API, Razorpay only; 'unsafe-inline' until Phase 9 nonces).
- Tests: payments.test.ts (20 cases on FakeProvider), config cases, vendor ownership. pnpm.cmd test:e2e runs twice: payments disabled, then FakeProvider with a stubbed checkout.js. Live E2E visitors use distinct X-Forwarded-For addresses (the DB-backed per-IP OTP cap otherwise trips after a few runs).
- Real Razorpay: the adapter created a real test order with the user's keys; a full Checkout payment is the user's step (pnpm.cmd payments:smoke, docs/PAYMENTS_LOCAL.md).
- Left: CT-04 contract PDF (needs a bundled Unicode font), boot-time reconcile and webhook retry on the tick (Phase 8), vendor cancel and full refund (BK-11), GSTIN editing UI, admin review screens. Receipts render INR instead of the rupee sign (standard PDF fonts).

## Phase 8 Notifications and jobs (+ brand mark) - 2026-10-24 (branch phase-8-notifications)
- Brand: <BrandMark>/<Brand> draw the real symbol from public/brand inline (bar = currentColor, circle = --brand-saffron #d97a00); app/icon.svg is the favicon; OG site name. Screenshot baselines force-updated (--update-snapshots=all: the small logo change was under the 1% tolerance).
- Migration 016_notifications.sql (additive): email_outbox template/priority/status/lease/dedupe_key/sender_name/purge columns (booking_id nullable); bookings.reminder_sent_at; job_runs.
- src/notifications: templates.ts (otp, hold_started, booking_request_vendor, booking_confirmed_customer/vendor, booking_cancelled, refund_issued, reminder_24h, payment_review, payment_recorded; text + table HTML, no images or tracking), outbox.ts (enqueue in the business transaction; sendOutbox claims with FOR UPDATE SKIP LOCKED + lease; backoff 1/5/30/120 min then failed; kickUrgent sends priority-0 mail after commit), booking-mail.ts (who gets what). OTP codes now go through the outbox and are blanked after sending. Vendor name is the visible sender ("X via Bayana").
- src/jobs.ts + POST /internal/jobs/tick|nightly (Bearer TICK_SECRET, 401/503): tick = expire_holds, process_webhooks, send_reminders (atomic reminder_sent_at claim + dedupe keys), send_outbox; nightly = reconcile_payments, cleanup (17.6), consistency_check (17.4). All recorded in job_runs; findings go to OPS_EMAIL as payment_review. pnpm.cmd jobs:tick / jobs:nightly run them locally.
- Config: TICK_SECRET (min 32, required in production, generated by setup:env), OPS_EMAIL (optional). .github/workflows/tick.yml (every 10 min) and nightly.yml: off until repo variable JOBS_ENABLED=true; secrets API_URL, TICK_SECRET.
- Tests: notifications.test.ts (SMTP down + backoff, priority, OTP via outbox, tick auth, two overlapping ticks = one reminder each, nightly). Integration files now run sequentially (vitest fileParallelism false). Status-write grep ignores WHERE clauses.
- Left: .ics calendar attachment, vendor cancellation (BK-11), real dashboard pages, sending-domain DNS (SPF/DKIM/DMARC) before production.

## Session handoff 2 - 2026-10-24, after Phase 8 (read this first; supersedes "Session handoff")
Phase numbers follow docs/CLAUDE_CODE_PHASES.md (SPEC 19.2 numbers its table differently). History is one straight line; nothing is pushed (origin/main = defc0df).
| Phase | Branch | Commit | Done | Left |
|---|---|---|---|---|
| 0 Audit | phase-0-audit | 4c2d705 | docs/AUDIT.md re-audit | items owned by later phases |
| (WIP snapshot) | phase-2-auth-hotfix | 680707c | old unreviewed work + password_hash leak fix | superseded |
| 1 Foundation | phase-1-foundation-v2 | 93082cf | config, Pino, errors, migration runner, Docker, CI | CI never run (needs a push) |
| 2 Design system | phase-2-design-system | 141281b | tokens, ui components, layouts, Playwright | baselines Windows-only |
| 3 Auth | phase-3-auth | f16574c | otp_codes, sessions, /v1/auth, login/signup/forgot | AU-10 admin second factor |
| (local setup) | fix-local-setup | d1a0da7 | setup:env, doctor, guarded db:migrate | - |
| 4 Vendor setup | phase-4-vendor-setup | 110af94 | overrides, booking window, ownership router, onboarding | seed.ts writes legacy availability |
| 5 Booking engine | phase-5-booking-engine | 67e2aa2 | spec columns, exclusion guard, transitionBooking, races | customers table not created |
| 6 Public experience | phase-6-public-experience | 1640f09 | ISR page, 6-step booking, contract evidence, /b/[id], /waking | CT-04 contract PDF |
| 7 Payments (test) | phase-7-payments | 836f475 | provider adapter, orders, verify, webhooks, late pay, offline, refunds, receipts, reconcile, CSP | see Razorpay below |
| 8 Notifications/jobs | phase-8-notifications | 331a13a | outbox + templates + backoff, tick/nightly, job_runs, workflows (off), brand mark | see "Not done" |
Facts for the next session:
- bayana_dev has migrations 001-016 (008 re-recorded after a one-time repair of 6 missing columns, approved by the user). The original "bayana" database is untouched. Backups in backups/ (git-ignored): bayana-dev-20261023-165408.dump, bayana-phase3-20261023.dump, bayana-pre-dev-20261024-185717.dump (old "bayana" before the copy), bayana_dev-pre-016-20261024-204735.dump, api.env.before-local-run (old apps/api/.env). Scratch DBs bayana_scratch_check008 and bayana_phase3_scratch* can be removed by the user.
- apps/api/.env: TICK_SECRET set, OPS_EMAIL absent, PAYMENT_MODE=test, RAZORPAY_KEY_ID/SECRET set (rzp_test_), RAZORPAY_WEBHOOK_SECRET empty, email -> Mailpit (Brevo line commented out; the user was told to rotate that Brevo key). Run jobs with pnpm.cmd jobs:tick / jobs:nightly. .github/workflows/tick.yml and nightly.yml exist but do nothing until repo variable JOBS_ENABLED=true and secrets API_URL + TICK_SECRET are set.
- Razorpay: adapter verified against the real test API (created a test order). User still has to: complete one real Checkout payment (pnpm.cmd payments:smoke), start a tunnel (Cloudflare Tunnel or zrok; Razorpay rejects ngrok domains), create the test webhook (5 events) and put its secret in RAZORPAY_WEBHOOK_SECRET. See docs/PAYMENTS_LOCAL.md.
- Not done yet: calendar .ics attachments, vendor-initiated cancellation (BK-11), real dashboard pages (Bookings, Calendar, Payments, Customers still show samples), admin console, SPF/DKIM/DMARC for the sending domain, Brevo SMTP untested, GitHub Actions not enabled.
- Tests: integration files run serially (vitest fileParallelism false: job tests send all due mail). Screenshot baselines are Windows-only (win32 suffix). test:visual, test:e2e, build and dev share apps/web/.next: run one at a time. Live E2E gives each visitor its own X-Forwarded-For (per-IP OTP cap lives in the DB). docs/RUN_LOCAL.md has the commands.
- Known: migration checksums hash raw bytes and *.sql has no eol rule in .gitattributes; a CRLF checkout would break checksums (add "*.sql text eol=lf" in a hardening step).

## Phase 9 Vendor dashboard and admin - 2026-10-24 (branch phase-9-dashboard-admin)
- Migration 017_dashboard_admin.sql (additive): users.is_admin/totp_secret_enc/totp_enabled_at/totp_last_step/deleted_at, sessions.second_factor_at, vendors.ical_token_hash/notify_prefs, outbox template booking_rescheduled, 3 indexes. Applied to bayana_test only; NOT to bayana_dev (backup first, commands in the Phase 9 report).
- API src/vendor-bookings.ts: vendor cancel (reason, full refund of everything paid, email, audit), complete (guard: confirmed and ended), reschedule (vendor lock, time off check, exclusion constraint -> SLOT_TAKEN with nothing changed, recordChange event, email, reminder reset), manual booking (idempotent, advance 0, PENDING->CONFIRMED by vendor, private-link email). booking-transition.ts gains recordChange (same-status events).
- src/dashboard-routes.ts (/v1/vendor): overview, bookings list/detail, calendar, payments, customers, settings (notify prefs honoured in booking-mail and reminders), iCal feed (token hash, GET /v1/ical/<token>.ics), export JSON, account delete (refused with upcoming bookings; anonymises login, keeps money records).
- src/admin-routes.ts (/v1/admin): is_admin (else 404) + TOTP on this session within 12 h (else 403); src/totp.ts (RFC 6238, AES-GCM secret via HKDF of SESSION_SECRET, replay guard, 5 failures/15 min). Health (tick stale > 30 min), users, vendors, bookings search + diagnosis with actions, payments (re-verify), webhooks (reprocess), outbox (retry), job runs (run tick/nightly), audit. Every read and action writes audit_logs (shared src/audit.ts).
- Web: dashboard home/calendar (month, week, day panel: block time, add booking)/bookings + /dashboard/bookings/[id]/payments/customers/settings on real data, cards below md; samples and preview banners removed from these pages. /admin console (AppShell extracted from DashboardShell). OfflinePaymentForm shared.
- Tests: dashboard-admin.test.ts (14), unit/admin.test.ts (TOTP RFC vectors, diagnose); Playwright e2e/dashboard.spec.ts (6 flows x 2 viewports), new baselines booking-detail, calendar, admin-booking, dashboard re-baselined after review; e2e-live/dashboard.spec.ts (manual booking + cancel + Mailpit).
- Make yourself admin: docs/RUN_LOCAL.md "Admin console". Left: customer-initiated reschedule (BK-09 customer side), payout/KYC settings, QR code for TOTP setup, .ics email attachments, CSP nonces (Phase 10).

## Google sign-in and passwordless-first auth - 2026-10-24 (branch auth-google-signin, from phase-9-dashboard-admin)
- Decision: vendors sign up and sign in with Google OR email code; password optional (Settings). Customers unchanged (email code only). SPEC 4.1 AU-01/AU-02, 12.1 and the AGENTS.md auth invariants updated.
- Migration 018_auth_identities.sql (additive): auth_identities (unique (provider, subject) and (user, provider), no tokens) and oauth_login_states (single-use state hashes, cleaned nightly). Applied to bayana_test only; bayana_dev still needs 017 and 018 (back up first).
- API src/google/: provider.ts (GoogleProvider, GoogleOidcProvider, FakeGoogleProvider signing real RS256 tokens, verifyIdToken via jose: JWKS signature, iss, aud, exp, nonce, email_verified; signed one-time cookie; PKCE S256), routes.ts (/v1/auth/providers, /google/start, /google/callback, /methods, DELETE /google, PUT and DELETE /password). Account rules in one transaction: identity, else same email linked, else new VENDOR user then /onboarding. Connect from Settings (mode=link) only to the signed-in account. `next` allowlist shared (@bayana/shared googleNextPath). New dependency: jose 6.1.0.
- Config: GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI optional (off without the id; id requires the other two). .env.example names only. docs/GOOGLE_SETUP.md.
- /signup takes email + code (password optional, validated if given). Password login for an account without one fails like a wrong password.
- Web: login = Continue with Google, then email code, then "Use password"; ?error= codes shown as sentences; signup = email then code, to /onboarding; Settings > Sign-in methods (connect/disconnect Google, email code, set/change/remove password).
- Tests: integration google.test.ts (17, FakeGoogleProvider), auth.test.ts updated; unit google.test.ts (config, allowlist, cookie, RFC 7636 PKCE vector); Playwright auth.spec.ts (Google button shown/hidden, cancelled message, sign-in methods). Real Google round trip NOT TESTED (needs the user's keys).

## Phase 10 Hardening - 2026-10-25 (branch phase-10-hardening, commit 3220420) - IN PROGRESS
- Web CSP per request (apps/web/middleware.ts, lib/csp.ts): nonce + 'strict-dynamic' on account pages (forced dynamic); static pages and the ISR /[slug] keep script 'unsafe-inline'. Headers in next.config.ts (nosniff, Referrer, X-Frame, Permissions, COOP; HSTS only for https). API: helmet CSP default-src 'none'; src/origin-check.ts (403 on foreign Origin or cross-site); per-route rate limits.
- Migration 019_consents.sql: consents (append-only, policy versions in @bayana/shared POLICY_VERSIONS), bookings.client_erased_at, ledger trigger now allows only reason='[personal details removed]'. src/consent.ts, src/privacy.ts (/v1/client/export, /v1/client/delete; closeLogin shared with vendor delete). Draft legal pages with "needs lawyer review" banner.
- Tests: integration hardening.test.ts (origin, headers, consent, erasure, IDOR over all 25 id routes, log scan); e2e/a11y.spec.ts + e2e-live/a11y.spec.ts (axe, 0 serious/critical after fixes); pnpm.cmd perf:lighthouse (measured LCP median 1.4 s; simulated estimate ~3.0 s). Fixes: removed /[slug]/loading.tsx (CLS 0.19 -> 0), fonts display optional, inlineCss, no prefetch on public links.
- Dependencies upgraded so pnpm audit is clean: zod 4, nodemailer 10, express 5.3, vitest 4 (include test/**/*.test.ts), Playwright 1.55.1; overrides postcss/body-parser; lighthouse via pnpm dlx. CI: pnpm audit --audit-level=high + gitleaks (.gitleaks.toml). .gitattributes *.sql eol=lf.
- Gates at 3220420: typecheck, lint, test (91 unit + 163 integration), build, test:visual (227, after reruns), test:e2e (6) all pass. NOT DONE: docs/LOCALHOST_SIGNOFF.md and running scripts/signoff-local.mjs (written, never run).

## Session handoff 3 - 2026-10-25 (read this first; supersedes handoffs 1 and 2). Full detail: docs/HANDOFF.md
| Phase | Branch | Commit | Done | Left |
|---|---|---|---|---|
| 0 Audit | phase-0-audit | 4c2d705 | re-audit | - |
| (WIP snapshot) | phase-2-auth-hotfix | 680707c | old work + password_hash leak fix | superseded |
| 1 Foundation | phase-1-foundation-v2 | 93082cf | config, logging, errors, migrations, Docker, CI | CI never run (not pushed) |
| 2 Design system | phase-2-design-system | 141281b | tokens, components, Playwright | Windows-only baselines |
| 3 Auth | phase-3-auth | f16574c | OTP, sessions, login/signup/forgot | - |
| (local setup) | fix-local-setup | d1a0da7 | setup:env, doctor | - |
| 4 Vendor setup | phase-4-vendor-setup | 110af94 | services, hours, onboarding | seed.ts legacy availability |
| 5 Booking engine | phase-5-booking-engine | 67e2aa2 | exclusion guard, transitionBooking | customers table not created |
| 6 Public experience | phase-6-public-experience | 1640f09 | ISR page, stepper, contract, /b, /waking | CT-04 PDF |
| 7 Payments (test) | phase-7-payments | 836f475 | orders, verify, webhooks, refunds, receipts | real Checkout + webhook untested |
| 8 Notifications/jobs | phase-8-notifications | 043b9e2 | outbox, templates, tick/nightly, job_runs | .ics, DNS |
| 9 Dashboard/admin | phase-9-dashboard-admin | 40f974c | real dashboard, vendor actions, /admin + TOTP | customer reschedule |
| Google sign-in | auth-google-signin | 71ccabd | Google OIDC, passwordless-first | real Google untested |
| 10 Hardening | phase-10-hardening | 3220420 + docs | see entry above | sign-off doc and run |
- bayana_dev and bayana_test: migrations 001-019 applied (dev backed up first to backups/bayana_dev-pre-017-019-20261025.dump). History is one straight line from main (defc0df); nothing pushed.
- Uncommitted Phase 11 deploy-prep work by another session sits in the worktree C:\dev\bayana-phase11 (branch phase-11-deploy-prep, based on 40f974c). Agreed plan: copy it onto a new branch hosting-ready from phase-10-hardening, adapt, test, then push that one branch (main untouched).
- Run: pnpm.cmd db:up; pnpm.cmd dev. Checks: typecheck, lint, test, build, test:visual, test:e2e (one at a time; stop dev first). docs/RUN_LOCAL.md has everything.
~~~~

### docs/DEPLOYMENT.md (in this repo; stale)
~~~~markdown
# Deployment checklist

1. Provision PostgreSQL 16 with automated backups. Use a distinct app role with no `UPDATE`/`DELETE` privilege on `ledger_entries` after migrations.
2. Deploy `apps/api` to an always-on service; set all required secrets and restrict CORS to the web origin.
3. Deploy `apps/web` to Vercel or a Node host. Set `API_ORIGIN` for server rendering and `NEXT_PUBLIC_API_ORIGIN` for browser requests.
4. Run the migration once using a direct database connection, seed only non-production demo data, and verify `/health`.
5. Before live payments: implement Razorpay webhook verification, set the exact HTTPS webhook URL, test retries, configure monitoring and complete KYC/Route approval.

Never point staging or production to the mock payment endpoint.
~~~~

### docs/DEPLOY.md (UNCOMMITTED, from worktree C:\dev\bayana-phase11, based on Phase 9)
~~~~markdown
# Deploying Bayana

Step-by-step setup for **staging** and **production** (SPEC section 16). Local development is in `docs/RUN_LOCAL.md`; backups and restores are in `docs/RESTORE.md`.

| Environment | Web (Vercel)        | API (Render)            | Database                  | Payments                   |
|-------------|---------------------|-------------------------|---------------------------|----------------------------|
| Local       | localhost:3000      | localhost:4000          | Docker Postgres 16        | disabled or test           |
| Staging     | staging.bayana.in   | api-staging.bayana.in   | Neon project `bayana-staging` | test                   |
| Production  | bayana.in           | api.bayana.in           | Neon project `bayana-prod`    | disabled, then live only after section 9 |

Ground rules:
- Values live only in the host dashboards and your password manager. This repo holds names only (`render.yaml`, `.env.example` files).
- Never set `PAYMENT_MODE=live` or `LIVE_PAYMENTS_ACK` until every cost gate in section 9 is done and a restore drill has passed.
- Do staging first and pass all 12 checks in section 8 before touching production.
- Each environment gets its **own** `SESSION_SECRET`, `OTP_PEPPER` and `TICK_SECRET`. Generate each one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 1. Rehearse locally first (already proven in Phase 11)

Before any account work, prove that the production image runs on your machine. Run these from the repository root in PowerShell, with Docker Desktop running.

```powershell
docker build -f apps/api/Dockerfile -t bayana-api:local .
```

Then create a rehearsal env file **outside the repo and outside OneDrive**, for example `C:\dev\secrets\rehearsal.env`:

```
NODE_ENV=production
APP_ENV=staging
TRUST_PROXY=1
WEB_ORIGINS=http://app.localtest.me:3200
SESSION_COOKIE_DOMAIN=.localtest.me
DATABASE_URL=postgres://[REDACTED]@host.docker.internal:5433/bayana_rehearsal
DATABASE_URL_DIRECT=postgres://[REDACTED]@host.docker.internal:5433/bayana_rehearsal
PAYMENT_MODE=disabled
EMAIL_TRANSPORT=smtp
SMTP_URL=smtp://host.docker.internal:1025
EMAIL_FROM=Bayana <hello@bayana.local>
SESSION_SECRET=[REDACTED]
OTP_PEPPER=[REDACTED]
TICK_SECRET=[REDACTED]
```

Production config refuses database names ending in `_dev` or `_test`, which is why a separate `bayana_rehearsal` database is used.

```powershell
docker exec bayana-postgres-1 psql -U bayana -d postgres -c "CREATE DATABASE bayana_rehearsal"   # once
docker run --rm --env-file C:\dev\secrets\rehearsal.env bayana-api:local node dist/src/migrate.js
docker run -d --name bayana-api-rehearsal --env-file C:\dev\secrets\rehearsal.env -p 4100:4000 bayana-api:local
curl.exe -s http://localhost:4100/health        # {"ok":true}
curl.exe -s http://localhost:4100/ready         # {"ok":true}  (proves the database works)
```

### Cookie rehearsal (SPEC 16.7 check 3, local)

This proves that the production cookie settings work across sub-domains. Staging uses `staging.bayana.in` and `api-staging.bayana.in`; locally the same shape is `app.localtest.me` and `api.localtest.me`.

```powershell
pnpm.cmd --filter @bayana/web test:cookies
```

The script:
- runs a real Chromium (full build, new headless mode);
- maps `*.localtest.me` to 127.0.0.1 inside the browser, so no hosts file or internet is needed;
- treats both origins as secure, so the `Secure` cookie behaves as it does on HTTPS.

It signs up through the container (the code comes from Mailpit and is then deleted) and checks each of the following:
- the cookie is `Domain=.localtest.me; HttpOnly; Secure; SameSite=Lax`;
- the web host receives the cookie on navigation;
- the web server forwards it with `apps/web/lib/server-api.ts`, and the API answers `/v1/auth/me` as that user;
- the session survives a reload;
- another site never gets the cookie;
- logout kills the session.

To rehearse with the real Next.js app instead, add these lines to `C:\Windows\System32\drivers\etc\hosts` (an administrator edit):

```
127.0.0.1 app.localtest.me
127.0.0.1 api.localtest.me
```

Then:
1. Build the web app with `NEXT_PUBLIC_API_URL=http://api.localtest.me:4100` and `NEXT_PUBLIC_SITE_URL=http://app.localtest.me:3200`.
2. Run `next start -p 3200`.
3. Browse at `http://app.localtest.me:3200`. Chrome only stores a `Secure` cookie over plain http when started with `--unsafely-treat-insecure-origin-as-secure=http://app.localtest.me:3200,http://api.localtest.me:4100 --user-data-dir=<temp folder>`.

Clean up with `docker rm -f bayana-api-rehearsal`.

---

## 2. Neon (database)

1. Create a project in an **Asia region** (Singapore, `ap-southeast-1`) running PostgreSQL 16. Use one project for staging and a separate one for production.
2. In the Neon dashboard, copy both connection strings:
   - **Pooled** (the host contains `-pooler`). This is the API's `DATABASE_URL`.
   - **Direct** (no `-pooler`). This is `DATABASE_URL_DIRECT`, used by migrations, backups and the check below.
3. Prove compatibility. The check runs `CREATE EXTENSION btree_gist`, tests an exclusion constraint like the double-booking guard, and tests `pg_advisory_xact_lock` and `SET LOCAL`. Everything is rolled back, so it is safe to repeat.
   ```powershell
   $env:NEON_CHECK_URL = "<direct connection string>"
   pnpm.cmd db:check-neon
   Remove-Item Env:NEON_CHECK_URL
   ```
   All four lines must say `PASS`. `server_version_num` must be 16xxxx; if Neon gives 17, set `PG_MAJOR: "17"` in `.github/workflows/backup.yml`.
4. PgBouncer rules (enforced by `apps/api/test/unit/pgbouncer-safety.test.ts`): the runtime may use only `pg_advisory_xact_lock`, `SET LOCAL` and `set_config(..., true)`, and never `LISTEN`/`NOTIFY`. `migrate.ts` alone takes a session lock, and it always uses the direct URL.
5. Optional hardening, carried over from the old `docs/DEPLOYMENT.md`: give the runtime its own role that cannot `UPDATE` or `DELETE` `ledger_entries`, and keep the owner role for migrations only. Rehearse this on staging first, because a missing grant shows up as a runtime 500.

## 3. Migrations (from your laptop, never from the API process)

Migrations run from the same image Render will run, against the **direct** URL. Production config validates every variable, so the env file needs the full set from section 7.

1. Put the values in `C:\dev\secrets\staging.env`, outside the repo and OneDrive. These are the same values you will paste into Render.
2. Run:
   ```powershell
   docker build -f apps/api/Dockerfile -t bayana-api:local .
   docker run --rm --env-file C:\dev\secrets\staging.env bayana-api:local node dist/src/migrate.js --status   # read-only: lists pending
   docker run --rm --env-file C:\dev\secrets\staging.env bayana-api:local node dist/src/migrate.js            # applies them
   ```
3. Expect `Applied N migrations.` On later runs, expect `Checksums of applied migrations verified.`
4. Delete the env file afterwards, or keep it encrypted.

For production, take a backup first (see `docs/RESTORE.md`) whenever the pending list contains anything that drops or renames.

## 4. Render (API)

1. Push the branch containing `render.yaml` to GitHub.
2. In Render, go to **New > Blueprint**, pick the repo, and apply `render.yaml`. It creates `bayana-api-staging`:
   - Docker runtime, free plan, Singapore;
   - health check `/health`;
   - `NODE_ENV=production` and `TRUST_PROXY=1` already set.
3. Render prompts for every `sync: false` variable. Enter the staging column from section 7.
4. Wait for the deploy, then check:
   ```powershell
   curl.exe -s https://bayana-api-staging.onrender.com/health
   curl.exe -s https://bayana-api-staging.onrender.com/ready
   ```
   Both should return `{"ok":true}`.
5. **Custom domain.** In the service's Settings > Custom Domains, add `api-staging.bayana.in`. Add the CNAME it shows in Cloudflare (section 6) as **DNS only (grey cloud)**, and wait for the certificate.
6. `TRUST_PROXY=1` is correct while Cloudflare is grey-clouded (only Render's proxy is in front). If you later turn the orange cloud on, set `TRUST_PROXY=2`.
7. Verify by signing in once, then running `SELECT host(ip) FROM sessions ORDER BY created_at DESC LIMIT 1;` in the Neon SQL editor. It must show your real public IP, not a Render address.

For production, copy the service in the Blueprint as `bayana-api-prod`, with `branch: main`, the production values and the domain `api.bayana.in`. Before the first live rupee, switch it to a paid always-on instance (section 9).

The free plan sleeps after 15 minutes idle and takes about a minute to wake. The web app's `/waking` page covers this (SPEC 16.6).

## 5. Vercel (web)

1. **Add New > Project**, then import the GitHub repo.
2. Set **Root Directory** to `apps/web`. Framework: Next.js. Leave **Include files outside the root directory** on; the app needs `packages/shared`.
3. Set these overrides:
   - **Install Command:** `pnpm install --frozen-lockfile`
   - **Build Command:** `pnpm --filter "@bayana/web..." build`. This builds `@bayana/shared` first; plain `next build` fails because `@bayana/shared` ships `dist/`.
   - **Node.js Version:** 22.x
4. Add the environment variables from section 7 (web rows):
   - Under **Preview**, use the staging values.
   - Under **Production**, use the production values.
   - `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing one.
5. Domains:
   - Staging project or branch: `staging.bayana.in`.
   - Production: `bayana.in`, plus `www.bayana.in` set to **Redirect to bayana.in (308)**.
6. Vercel **Hobby** is non-commercial. It is fine for staging and personal testing, but production that earns money must move to Pro or another host first (section 9).

## 6. DNS (Cloudflare) — merge, don't replace

Zoho Mail already receives mail for `@bayana.in`. **Before changing anything:**
1. Export the zone (DNS > Records > Export).
2. Screenshot the existing MX, TXT and `_domainkey` records.

Keep every Zoho record exactly as it is.

| Type | Name | Content | Proxy | Purpose |
|------|------|---------|-------|---------|
| A | `@` | the IP Vercel shows for the apex (currently `76.76.21.21`) | DNS only | bayana.in → Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only | www → Vercel (redirects to apex) |
| CNAME | `staging` | `cname.vercel-dns.com` | DNS only | staging web |
| CNAME | `api` | `bayana-api-prod.onrender.com` (exact value from Render) | DNS only | production API |
| CNAME | `api-staging` | `bayana-api-staging.onrender.com` (exact value from Render) | DNS only | staging API |
| MX | `@` | **existing Zoho MX** (for India: `mx.zoho.in` 10, `mx2.zoho.in` 20, `mx3.zoho.in` 50) | — | keep unchanged |
| TXT | `@` | **one** SPF record: `v=spf1 include:zoho.in include:spf.brevo.com ~all` | — | merged SPF, see below |
| TXT | `zmail._domainkey` (your Zoho selector) | **existing Zoho DKIM** | — | keep unchanged |
| CNAME or TXT | `brevo1._domainkey`, `brevo2._domainkey` | exactly what Brevo's **Senders, Domains > bayana.in > Authenticate** page shows | DNS only | Brevo DKIM |
| TXT | `@` | `brevo-code:<value from Brevo>` | — | Brevo domain ownership |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@bayana.in; adkim=r; aspf=r; pct=100` | — | one DMARC record for both senders |

Rules:
- **Exactly one SPF record.** If a `v=spf1 include:zoho.in ~all` TXT exists, *edit* it to add `include:spf.brevo.com`. Never add a second `v=spf1` record; two SPF records fail SPF for everyone. Use the include Brevo's page shows if it differs, and keep the whole record under 10 DNS lookups.
- DKIM selectors differ (Zoho `zmail`, Brevo `brevo1`/`brevo2`), so both coexist.
- **Exactly one DMARC record.** If `_dmarc` already exists, keep its `rua` and edit it in place. Start with `p=none`. After two weeks of clean reports from both Zoho and Brevo mail, move to `p=quarantine`.
- If the zone has CAA records, they must allow `letsencrypt.org` and `pki.goog` for Vercel and Render certificates.
- The API and web records stay grey-clouded (DNS only) so certificates issue and `TRUST_PROXY=1` stays correct.
- Verify:
  - Brevo's domain page shows all checks green.
  - Send one booking email to the address mail-tester.com gives you, and confirm SPF, DKIM and DMARC all pass (staging check 11).
  - Send one email from Zoho to Gmail and confirm "Show original" still shows SPF, DKIM and DMARC as PASS.

Brevo SMTP for the API is `SMTP_URL=smtp://[REDACTED]@smtp-relay.brevo.com:587`. URL-encode the login, because its `@` becomes `%40`. `EMAIL_FROM` must use the authenticated domain, for example `Bayana <bookings@bayana.in>`, with replies going to the Zoho mailbox.

## 7. Environment variable matrix

API variables are validated at startup (`apps/api/src/config-schema.ts`) and the API exits with names-only messages if anything is wrong. Web variables are validated by `apps/web/env-schema.ts` at build time.

### API (Render dashboard; locally `apps/api/.env`)

| Variable | Local | Staging | Production | Secret |
|----------|-------|---------|------------|--------|
| `NODE_ENV` | development | production (in render.yaml) | production (in render.yaml) | no |
| `APP_ENV` | local | staging | production | no |
| `PORT` | 4000 | set by Render | set by Render | no |
| `TRUST_PROXY` | 0 | 1 (in render.yaml) | 1 (in render.yaml) | no |
| `WEB_ORIGINS` | http://localhost:3000 | https://staging.bayana.in | https://bayana.in | no |
| `SESSION_COOKIE_DOMAIN` | empty | .bayana.in (see cookie note) | .bayana.in | no |
| `DATABASE_URL` | Docker `bayana_dev` | Neon staging **pooled** | Neon prod **pooled** | yes |
| `DATABASE_URL_DIRECT` | empty | Neon staging **direct** | Neon prod **direct** | yes |
| `DATABASE_URL_TEST` | Docker `bayana_test` | not set | not set | no |
| `SESSION_SECRET` | generated | new random | new random | yes |
| `OTP_PEPPER` | generated | new random | new random | yes |
| `TICK_SECRET` | generated | new random (= GitHub secret) | new random (= GitHub secret) | yes |
| `OPS_EMAIL` | optional | your inbox | your inbox | no |
| `EMAIL_TRANSPORT` | smtp (Mailpit) | smtp | smtp | no |
| `SMTP_URL` | smtp://localhost:1025 | Brevo SMTP URL | Brevo SMTP URL | yes |
| `EMAIL_FROM` | Bayana <hello@bayana.local> | Bayana Staging <bookings@bayana.in> | Bayana <bookings@bayana.in> | no |
| `PAYMENT_MODE` | disabled or test | test | disabled (live only after section 9) | no |
| `RAZORPAY_KEY_ID` | rzp_test_… | rzp_test_… | empty while disabled | no |
| `RAZORPAY_KEY_SECRET` | test secret | test secret | empty while disabled | yes |
| `RAZORPAY_WEBHOOK_SECRET` | from test webhook | from staging test webhook | empty while disabled | yes |
| `LIVE_PAYMENTS_ACK` | empty | **never set** | **never set** until section 9 | no |
| `HOLD_MINUTES`, `REQUEST_HOLD_HOURS`, `MIN_ADVANCE_PAISE` | defaults (15, 48, 10000) | defaults | defaults | no |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | arrive with the Google sign-in branch | per-environment OAuth client; redirect `https://api-staging.bayana.in/v1/auth/google/callback` | redirect `https://api.bayana.in/v1/auth/google/callback` | secret: yes |

### Web (Vercel: Preview = staging, Production = production; locally `apps/web/.env.local`)

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | https://api-staging.bayana.in | https://api.bayana.in |
| `NEXT_PUBLIC_SITE_URL` | http://localhost:3000 | https://staging.bayana.in | https://bayana.in |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | empty or rzp_test_… | rzp_test_… | empty (the web build refuses live ids) |

Every `NEXT_PUBLIC_*` value is public. Never put a secret there.

### GitHub Actions (Settings > Secrets and variables > Actions)

| Name | Kind | Used by | Value |
|------|------|---------|-------|
| `API_URL` | secret | tick.yml, nightly.yml | `https://api-staging.bayana.in` (no trailing slash) |
| `TICK_SECRET` | secret | tick.yml, nightly.yml | same as the API's `TICK_SECRET` |
| `JOBS_ENABLED` | variable | tick.yml, nightly.yml | `true` to switch the schedulers on |
| `BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | secrets | backup.yml | see `docs/RESTORE.md` |
| `BACKUPS_ENABLED` | variable | backup.yml | `true` only when you decide to start backups |

**Cookie note (staging and production share `.bayana.in`).** Both environments use the cookie name `bayana_session` with `Domain=.bayana.in`. One browser signed in to both would send both cookies to each API, and one environment would see the other's token and answer 401. Until the auth code supports a per-environment cookie name, test staging in a separate browser profile. This needs an auth change, so it is reported to the auth work stream, not changed here.

## 8. Staging go-live checklist (SPEC 16.7)

Run each check and record PASS or FAIL with the date.

| # | Check | How | Pass when |
|---|-------|-----|-----------|
| 1 | Health | `curl.exe -s https://api-staging.bayana.in/health` and `/ready` | both `{"ok":true}` |
| 2 | Accounts | signup, logout, password login, OTP login for one email | all four work |
| 3 | Cookies | sign in on staging.bayana.in, reload the dashboard | session survives reload and server fetch; cookie shows `Domain=.bayana.in; Secure; HttpOnly; SameSite=Lax` in DevTools |
| 4 | Booking + test payment | book, pay with a Razorpay test card | HELD → PENDING → CONFIRMED, emails arrive, ledger correct |
| 5 | Race | double-click and two browsers on one slot | exactly one booking |
| 6 | Closed tab | close the tab right after paying | webhook confirms the booking |
| 7 | Late payment | let the hold expire, then pay | re-claim or refund path works |
| 8 | Cold start | wait 20 minutes idle, then open a page | `/waking` shows, then recovers |
| 9 | Webhook replay | suspend the Render service, pay, resume it so Razorpay's retries deliver the events (some more than once); then run `SELECT event_id, count(*) FROM webhook_events GROUP BY 1 HAVING count(*) > 1` and check the booking's ledger | no duplicate rows; one capture in the ledger |
| 10 | Scheduler | GitHub Actions > Jobs tick | ran in the last 30 minutes; admin health green |
| 11 | Email auth | mail-tester.com | SPF, DKIM, DMARC pass |
| 12 | No secrets | GitHub secret scanning, browser bundle search for `rzp_` secrets and `SESSION_SECRET`, Render log review | clean |

Razorpay test webhook: in the Razorpay **Test** dashboard, go to Webhooks and set the URL `https://api-staging.bayana.in/webhooks/razorpay`. This path has no `/v1` prefix (`apps/api/src/app.ts`); SPEC 16.5 shows an older one. Subscribe to `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed` (the same list as `docs/PAYMENTS_LOCAL.md`), and put the secret into `RAZORPAY_WEBHOOK_SECRET` on Render.

## 9. Cost gates before the first live rupee (SPEC 16.8)

`PAYMENT_MODE` stays `test` (staging) or `disabled` (production) until **every** row is done and a restore drill (`docs/RESTORE.md`) has passed.

| Gate | Why | Action | Approx cost | Done |
|------|-----|--------|-------------|------|
| Commercial hosting terms | Vercel Hobby is non-commercial | Vercel Pro, or host the web app elsewhere commercially | about 20 USD/month | ☐ |
| Always-on API | the free API sleeps and restarts; payments and webhooks need reliability | Render paid instance (Starter) for `bayana-api-prod` | about 7 USD/month and up | ☐ |
| Database safety | free Neon has short history and a small size limit | paid Neon plan with point-in-time restore, plus `backup.yml` enabled and a restore proven | plan-dependent | ☐ |
| Email volume | Brevo free caps at 300 a day | Brevo Starter | about 9 USD/month | ☐ |
| Payments live | KYC, settlement account, Route decision | Razorpay live activation | per-transaction fees | ☐ |
| Legal pages | policies must be accurate | lawyer reviews terms, privacy and refunds | one-time | ☐ |
| Monitoring | someone must know when it breaks | Sentry alerts plus an uptime check to phone or email | free to low | ☐ |

When to leave the free tiers is covered in SPEC 16.9: at the first paying vendor, more than about 20 active vendors or 200 bookings a month, or cold starts hurting conversion.

## 10. Production order

1. Make sure the cost-gate rows you need for the launch type are done.
2. Create the Neon prod project and pass `pnpm.cmd db:check-neon`.
3. Run migrations (section 3) with the prod env file.
4. Deploy the Render prod service, attach the domain `api.bayana.in`, and check `/health` and `/ready`.
5. Set the Vercel production env, deploy, and attach `bayana.in` and `www`.
6. Add the GitHub secrets for the prod API (or a second set of workflows), and set `JOBS_ENABLED=true`.
7. Enable backups (`docs/RESTORE.md`) and run one manual backup and one restore drill.
8. Run checks 1–3, 8, 10 and 12 of section 8 against production.
~~~~

### docs/RUN_LOCAL.md
~~~~markdown
# Run Bayana on your machine (Windows, PowerShell)

Always call `pnpm.cmd`, not `pnpm`. Docker Desktop must be running.

## Ports

| What | Where |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:4000 (`/health`, `/ready`) |
| PostgreSQL 16 | localhost:**5433** (Docker; user and password `bayana`). Databases: `bayana_dev` and `bayana_test` |
| Mailpit | SMTP on localhost:1025; inbox at http://localhost:8025 (every local email, including sign-in codes, lands here) |

## First time

```powershell
pnpm.cmd install
pnpm.cmd db:up            # Postgres and Mailpit
pnpm.cmd setup:env        # creates apps/api/.env and apps/web/.env.local if missing (generates SESSION_SECRET, OTP_PEPPER, TICK_SECRET); never overwrites
pnpm.cmd db:create        # creates bayana_dev and bayana_test if missing; never drops anything
pnpm.cmd db:migrate       # applies pending migrations; refuses unless the database name ends in _dev
pnpm.cmd run doctor       # every check should PASS ("run" matters: plain "pnpm doctor" is a pnpm built-in)
pnpm.cmd dev              # web on 3000 and API on 4000
```

## Every day

```powershell
pnpm.cmd db:up
pnpm.cmd dev
```

Then:
1. Sign up as a vendor at http://localhost:3000/signup and read the code in Mailpit.
2. Finish `/onboarding` and publish.
3. Book your own page from a private window.

## Settings that matter (apps/api/.env)

- `DATABASE_URL` points at `bayana_dev`. `DATABASE_URL_TEST` points at `bayana_test`; tests refuse any other database.
- `EMAIL_TRANSPORT=smtp` with `SMTP_URL=smtp://localhost:1025` sends everything to Mailpit.
- `PAYMENT_MODE`:
  - `disabled` means bookings wait for the vendor to record an offline advance.
  - `test` uses your `rzp_test_` keys.
  - `live` is refused in this build.
  - Test-mode payments are covered in `docs/PAYMENTS_LOCAL.md`, including test cards, the webhook tunnel and refunds.
- `TICK_SECRET` protects `POST /internal/jobs/tick` and `/nightly`.
- `OPS_EMAIL` is optional and receives payment and consistency reviews.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are optional. With them set, the login page shows "Continue with Google". Setup steps are in `docs/GOOGLE_SETUP.md`.

## Background jobs locally

Nothing runs on a timer. Urgent mail (codes, payments, confirmations) is sent right after each request. Everything else waits for a tick:

```powershell
pnpm.cmd jobs:tick        # expire holds, retry webhooks, queue 24-hour reminders, send the email outbox
pnpm.cmd jobs:nightly     # payment reconcile (test mode only), retention cleanup, consistency checks
pnpm.cmd payments:reconcile [hours]   # report-only comparison with Razorpay
pnpm.cmd payments:smoke   # one real test-mode payment end to end (see docs/PAYMENTS_LOCAL.md)
```

## Admin console (/admin)

Admin access is never granted by the app. Turn it on for your own account with SQL:

```powershell
docker exec -it bayana-postgres-1 psql -U bayana -d bayana_dev -c "UPDATE users SET is_admin=true WHERE email_normalized='you@example.com';"
```

Then sign in normally and open http://localhost:3000/admin.
- The first visit sets up an authenticator app (TOTP). The setup key is shown once.
- After that, every new session asks for a 6-digit code, and again every 12 hours.
- If an admin loses their phone, another admin (or you, in psql) resets it. They then set it up again on the next visit:
  ```powershell
  docker exec -it bayana-postgres-1 psql -U bayana -d bayana_dev -c "UPDATE users SET totp_secret_enc=NULL,totp_enabled_at=NULL,totp_last_step=NULL WHERE email_normalized='you@example.com';"
  ```

Every admin page view and action is written to `audit_logs`. To diagnose a stuck booking, search for it on Health or Bookings and open it. The page lists what the booking is waiting for, with a button for the action that moves it on.

## Checks before a commit

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test             # unit, then integration (migrates bayana_test first)
pnpm.cmd build
pnpm.cmd test:visual      # Playwright against next dev with a mocked API (Windows screenshot baselines)
pnpm.cmd test:e2e         # real API on bayana_test plus Mailpit; runs twice (payments disabled, then FakeProvider)
pnpm.cmd audit --audit-level=high   # known vulnerabilities in dependencies (CI runs this too)
pnpm.cmd perf:lighthouse  # public page on a production build, mobile throttling; fails when LCP is 2.5 s or more
```

Rules for these runs:
- **One at a time.** `test:visual`, `test:e2e`, `perf:lighthouse`, `build` and `pnpm.cmd dev` all use `apps/web/.next`. Stop `pnpm.cmd dev` before running them.
- **`test:e2e` and `perf:lighthouse` read `DATABASE_URL_TEST` from the shell, not from apps/api/.env.** Copy it into the shell first:
  ```powershell
  $env:DATABASE_URL_TEST = (Select-String '^DATABASE_URL_TEST=' apps\api\.env).Line.Split('=',2)[1]
  ```
- **Ports in use?** The live suite uses 3200 and 4100 by default; set `$env:E2E_API_PORT=4110; $env:E2E_WEB_PORT=3210` to move it.
- **Secret scan** (CI runs the same):
  ```powershell
  docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:v8.24.3 git /repo --redact --no-banner --config /repo/.gitleaks.toml
  ```

## Localhost sign-off (Phase 10, not finished)

`pnpm.cmd signoff:local` (scripts/signoff-local.mjs) runs SPEC 16.7 checks 1-5, 10 and 12 against the running dev app (`pnpm.cmd dev`) and Mailpit. It creates its own `signoff-...` vendor and customers in bayana_dev. It has been written but **not yet run**; docs/LOCALHOST_SIGNOFF.md is still to be written.

## Notes

- **Avoid `pnpm.cmd seed:dev` for now.** It still writes the legacy availability table, so its sample vendor has no bookable hours. Create a vendor through `/signup` instead.
- **Before any destructive migration,** back up first. Use `pg_dump -f` inside the container plus `docker cp`; PowerShell's `>` corrupts binary dumps:
  ```powershell
  docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/bayana_dev.dump bayana_dev
  docker cp bayana-postgres-1:/tmp/bayana_dev.dump backups\bayana_dev-<date>.dump
  ```
- **Restore a backup** (overwrites that database; only with a dump you trust):
  ```powershell
  docker cp backups\bayana_dev-<date>.dump bayana-postgres-1:/tmp/restore.dump
  docker exec bayana-postgres-1 pg_restore -U bayana -d bayana_dev --clean --if-exists --no-owner /tmp/restore.dump
  ```
- **If something fails,** `pnpm.cmd run doctor` prints a fix for each failed check.
- **Moving the project folder** (for example to `C:\dev\bayana`): copy `.env`, `apps\api\.env`, `apps\web\.env.local` and `backups\` by hand (they are not in git). Docker Compose names the project after the folder, so a folder named `bayana` keeps using the volume `bayana_postgres_data` (your data). Run `pnpm.cmd db:up` from the new folder; then `git worktree repair` if you use extra worktrees.
~~~~

### CLAUDE_CODE_PHASES.md: phase list (repo root)
| Phase | Title | Gate (abridged) | Status (from PROGRESS/HANDOFF) |
|---|---|---|---|
| 0 | Audit and keep/rewrite decision | audit report | done |
| 1 | Foundation | env, DB, migrations, CI | done |
| 2 | Design system and app shell | UI kit and tokens | done |
| 3 | Auth | OTP, sessions, passwords | done (plus Google sign-in, commit 71ccabd) |
| 4 | Vendor setup | onboarding, publish | done |
| 5 | Booking engine | holds, exclusion constraint, `transitionBooking` | done |
| 6 | Public page and booking flow | customer books end to end | done |
| 7 | Payments | Razorpay test mode, webhooks | built; real Checkout and webhook untested |
| 8 | Emails and background jobs | outbox, `/internal/jobs/tick` | built; GitHub Actions not enabled |
| 9 | Vendor dashboard and admin | dashboard, admin console | done |
| 10 | Hardening and localhost sign-off | localhost sign-off passes (milestone M0) | **in progress**: `docs/LOCALHOST_SIGNOFF.md` not written, `signoff:local` never run |
| 11 | Deploy preparation (still local) | production-mode build runs locally; DEPLOY.md followable | **uncommitted** in worktree C:\dev\bayana-phase11 |
| 12 | Go online (staging first) | all 12 staging checks pass | not started |
| – | Before live payments (not a phase) | SPEC 16.8 cost gates | not started |

---

## 2. Manifests and versions

### package.json (root)
~~~~json
{"name":"bayana","private":true,"packageManager":"pnpm@10.13.1","scripts":{"perf:lighthouse":"pnpm --filter @bayana/web perf:lighthouse","dev":"pnpm --parallel --filter @bayana/api --filter @bayana/web dev","db:up":"docker compose up -d","db:create":"pnpm --filter @bayana/api db:create","db:migrate":"pnpm --filter @bayana/api migrate","db:migrate:test":"pnpm --filter @bayana/api migrate:test","db:migrate:status":"pnpm --filter @bayana/api migrate:status","seed:dev":"pnpm --filter @bayana/api seed","build":"pnpm -r build","test":"pnpm run test:unit && pnpm run test:integration","test:unit":"pnpm --filter @bayana/api test:unit","test:integration":"pnpm --filter @bayana/api test:integration","lint":"pnpm --filter @bayana/shared build && pnpm -r lint","typecheck":"pnpm --filter @bayana/shared build && pnpm -r typecheck","test:visual":"pnpm --filter @bayana/web test:visual","test:e2e":"pnpm --filter @bayana/web test:e2e","jobs:tick":"pnpm --filter @bayana/api jobs:tick","jobs:nightly":"pnpm --filter @bayana/api jobs:nightly","payments:reconcile":"pnpm --filter @bayana/api payments:reconcile","payments:smoke":"pnpm --filter @bayana/api payments:smoke","setup:env":"node scripts/setup-env.mjs","doctor":"node scripts/doctor.mjs","signoff:local":"node scripts/signoff-local.mjs"},"pnpm":{"overrides":{"postcss@<8.5.23":"^8.5.31","body-parser@<2.4.0":"^2.4.0"}}}
~~~~

### apps/api/package.json
~~~~json
{"name":"@bayana/api","version":"0.1.0","private":true,"type":"module","scripts":{"dev":"pnpm --filter @bayana/shared build && tsx watch src/server.ts","build":"tsc -p tsconfig.json","start":"node dist/src/server.js","migrate":"pnpm --filter @bayana/shared build && tsx src/migrate.ts","migrate:status":"pnpm --filter @bayana/shared build && tsx src/migrate.ts --status","migrate:test":"cross-env NODE_ENV=test PAYMENT_MODE=disabled RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= tsx src/create-databases.ts && cross-env NODE_ENV=test PAYMENT_MODE=disabled RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= tsx src/migrate.ts","seed":"pnpm --filter @bayana/shared build && tsx src/seed.ts","test":"pnpm run test:unit && pnpm run test:integration","test:unit":"pnpm --filter @bayana/shared build && cross-env NODE_ENV=test PAYMENT_MODE=disabled RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= EMAIL_TRANSPORT=capture vitest run test/unit","test:integration":"pnpm run migrate:test && cross-env NODE_ENV=test PAYMENT_MODE=disabled RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= EMAIL_TRANSPORT=capture TRUST_PROXY=1 TICK_SECRET=[REDACTED] OPS_EMAIL=ops@example.test vitest run test/integration","lint":"tsc --noEmit -p tsconfig.json","typecheck":"tsc --noEmit -p tsconfig.json","db:create":"tsx src/create-databases.ts","jobs:tick":"pnpm --filter @bayana/shared build && tsx src/jobs-cli.ts tick","jobs:nightly":"pnpm --filter @bayana/shared build && tsx src/jobs-cli.ts nightly","payments:reconcile":"pnpm --filter @bayana/shared build && tsx src/reconcile-cli.ts","payments:smoke":"tsx ../../scripts/payments-smoke.ts"},"dependencies":{"@bayana/shared":"workspace:*","argon2":"^0.45.1","cors":"^2.8.5","dotenv":"^16.6.1","express":"^5.3.0","express-rate-limit":"^8.7.1","helmet":"^8.3.0","jose":"6.1.0","nodemailer":"^10.2.1","pdf-lib":"1.17.1","pg":"^8.16.3","pino":"^9.14.0","razorpay":"^2.9.8","zod":"4.6.7"},"devDependencies":{"@types/cors":"^2.8.19","@types/express":"^5.0.3","@types/node":"^22.15.3","@types/nodemailer":"^8.0.2","@types/pg":"^8.15.5","cross-env":"^7.0.3","pg-mem":"^3.0.5","tsx":"^4.19.3","typescript":"^5.8.3","vitest":"^4.1.12"}}
~~~~

### apps/web/package.json
~~~~json
{"name":"@bayana/web","version":"0.1.0","private":true,"scripts":{"perf:lighthouse":"node perf/lighthouse.mjs","dev":"pnpm --filter @bayana/shared build && next dev","build":"next build","start":"next start","lint":"tsc --noEmit","typecheck":"tsc --noEmit","test:visual":"playwright test","test:visual:update":"playwright test --update-snapshots","test:e2e":"node e2e-live/run.mjs"},"dependencies":{"@bayana/shared":"workspace:*","@radix-ui/react-avatar":"^1.3.1","@radix-ui/react-checkbox":"^1.4.1","@radix-ui/react-dialog":"^1.3.1","@radix-ui/react-label":"^2.1.17","@radix-ui/react-select":"^2.4.1","@radix-ui/react-slot":"^1.5.0","@radix-ui/react-switch":"^1.4.1","@radix-ui/react-tabs":"^1.2.1","@radix-ui/react-toast":"^1.3.1","@tailwindcss/postcss":"^4.3.3","class-variance-authority":"~0.7.1","clsx":"^2.1.1","lucide-react":"~0.460.0","next":"^15.3.1","react":"^19.1.0","react-dom":"^19.1.0","tailwind-merge":"^3.7.0","tailwindcss":"^4.3.3","zod":"4.6.7"},"devDependencies":{"@axe-core/playwright":"4.10.2","@playwright/test":"~1.55.1","@types/node":"^22.15.3","@types/react":"^19.1.2","@types/react-dom":"^19.1.2","typescript":"^5.8.3"}}
~~~~

### packages/shared/package.json
~~~~json
{"name":"@bayana/shared","version":"0.1.0","private":true,"type":"module","exports":{"types":"./dist/index.d.ts","default":"./dist/index.js"},"scripts":{"build":"tsc -p tsconfig.json","lint":"tsc --noEmit -p tsconfig.json","typecheck":"tsc --noEmit -p tsconfig.json"},"devDependencies":{"typescript":"^5.8.3"},"dependencies":{"zod":"4.6.7"}}
~~~~

### pnpm-workspace.yaml
~~~~yaml
packages:
  - apps/*
  - packages/*
~~~~

### .nvmrc / engines
- `.nvmrc`: **does not exist**. `.node-version`: does not exist.
- `engines`: **not set** in any package.json.
- `packageManager`: `pnpm@10.13.1` (root).
- Node is pinned only by `node:22-alpine` in both Dockerfiles and `node-version: 22` in `.github/workflows/ci.yml`.

---

## 3. Environment variables

### apps/api/.env.example (names only)
NODE_ENV, APP_ENV, PORT, TRUST_PROXY, WEB_ORIGINS, SESSION_COOKIE_DOMAIN, DATABASE_URL, DATABASE_URL_DIRECT, DATABASE_URL_TEST, HOLD_MINUTES, REQUEST_HOLD_HOURS, MIN_ADVANCE_PAISE, PAYMENT_MODE, LIVE_PAYMENTS_ACK, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, EMAIL_TRANSPORT, SMTP_URL, EMAIL_FROM, SESSION_SECRET, OTP_PEPPER, TICK_SECRET, OPS_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

### apps/web/.env.example (names only)
NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID, NEXT_PUBLIC_SENTRY_DSN

### .env.example (root)
Comments only, pointing at the two per-app files. (A legacy root `.env` also exists locally and is git-ignored. Neither app reads it: dotenv loads from each app's own directory.)

### API: what `apps/api/src/config-schema.ts` actually requires
The API validates `process.env` with Zod at import time (`apps/api/src/config.ts`) and exits 1 listing every problem by name. "Local" is presence in the developer's `apps/api/.env` today (local development, not a deployed environment).

| Variable | Allowed values / rule | Required | Local |
|---|---|---|---|
| NODE_ENV | `development` \| `test` \| `production` (default development) | no | set |
| APP_ENV | `local` \| `staging` \| `production` (default local) | no | missing |
| PORT | integer 1–65535 (default 4000) | no | set |
| TRUST_PROXY | integer 0–10 hops (default 0; 1 on Render) | no | missing |
| WEB_ORIGINS | comma-separated exact origins, no path or trailing slash | **yes** (legacy `WEB_ORIGIN` accepted outside production only) | set |
| WEB_ORIGIN | legacy single origin; ignored in production | no | set |
| SESSION_COOKIE_DOMAIN | empty locally, e.g. `.bayana.in` deployed | no | missing |
| DATABASE_URL | postgres URL; name must end `_dev` under development, must not end `_dev`/`_test` in production | **yes** (unless NODE_ENV=test) | set |
| DATABASE_URL_DIRECT | postgres URL for migrations (unpooled) | **yes in production**; falls back to DATABASE_URL otherwise | missing |
| DATABASE_URL_TEST | postgres URL whose name ends `_test` | **yes when NODE_ENV=test** | set |
| HOLD_MINUTES | integer ≥ 1 (default 15) | no | set |
| REQUEST_HOLD_HOURS | integer 1–168 (default 48) | no | missing |
| MIN_ADVANCE_PAISE | positive integer (default 10000) | no | set |
| PAYMENT_MODE | `disabled` \| `test` \| `live` (default disabled); `live` only with NODE_ENV=production **and** LIVE_PAYMENTS_ACK=yes | no | set (`test`) |
| LIVE_PAYMENTS_ACK | empty or literal `yes` | no | missing |
| RAZORPAY_KEY_ID | must start `rzp_test_` or `rzp_live_`; live key refused unless mode live; test key refused in live | yes when mode test/live | set (test-kind key) |
| RAZORPAY_KEY_SECRET | non-empty | yes when mode test/live | set |
| RAZORPAY_WEBHOOK_SECRET | ≥ 16 chars | yes when mode live | missing |
| PAYMENT_PROVIDER | `razorpay` \| `fake` (default razorpay); `fake` only under NODE_ENV=test | no | missing |
| EMAIL_TRANSPORT | `smtp` \| `log` (development only) \| `capture` (test only); default capture under test, else smtp | no | set (`smtp`, to local Mailpit) |
| SMTP_URL | URL | yes when transport smtp | set |
| EMAIL_FROM | ≥ 3 chars, e.g. `Bayana <hello@bayana.in>` | yes when transport smtp | set |
| SESSION_SECRET | ≥ 32 chars | **always** | set |
| OTP_PEPPER | ≥ 16 chars; falls back to SESSION_SECRET outside production | **yes in production** | missing |
| TICK_SECRET | ≥ 32 chars | **yes in production** | set |
| OPS_EMAIL | email | no | missing |
| GOOGLE_CLIENT_ID | `…​.apps.googleusercontent.com`; empty turns Google sign-in off | no | set |
| GOOGLE_CLIENT_SECRET | ≥ 8 chars | yes when GOOGLE_CLIENT_ID set | set |
| GOOGLE_REDIRECT_URI | URL whose path ends `/v1/auth/google/callback` | yes when GOOGLE_CLIENT_ID set | set |

### Web: what `apps/web/env-schema.ts` actually requires
Validated in `next.config.ts` (fails `next dev` and `next build` with exit 1) and at runtime in `apps/web/env.ts`. All are `NEXT_PUBLIC_*`, so they are **baked in at build time**.

| Variable | Allowed values / rule | Required | Local (`apps/web/.env.local`) |
|---|---|---|---|
| NEXT_PUBLIC_API_URL | exact origin, no path or trailing slash | **yes** | set |
| NEXT_PUBLIC_SITE_URL | exact origin, no path or trailing slash | **yes** | set |
| NEXT_PUBLIC_RAZORPAY_KEY_ID | empty or `rzp_test_[A-Za-z0-9]+` (live ids refused in this build) | no | missing |
| NEXT_PUBLIC_SENTRY_DSN | empty or URL (its origin is added to CSP connect-src) | no | missing |

---

## 4. Container, hosting and CI config

### apps/api/Dockerfile
~~~~dockerfile
# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @bayana/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @bayana/shared build && pnpm --filter @bayana/api build
# Production dependencies only, with @bayana/shared resolved as a real directory.
RUN pnpm --filter @bayana/api deploy --prod --legacy /out \
 && rm -rf /out/node_modules/@bayana/shared && mkdir -p /out/node_modules/@bayana/shared \
 && cp -r packages/shared/package.json packages/shared/dist /out/node_modules/@bayana/shared/ \
 && rm -rf /out/dist /out/src /out/test /out/sql /out/Dockerfile /out/tsconfig.json /out/vitest.config.ts \
 && cp -r apps/api/dist /out/dist && rm -rf /out/dist/test && cp -r apps/api/sql /out/dist/sql

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
~~~~

### apps/web/Dockerfile
~~~~dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @bayana/web build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 3000
CMD ["pnpm", "--filter", "@bayana/web", "start"]
~~~~

### .dockerignore
~~~~text
**/node_modules
**/.next
**/dist
**/.env
**/.env.*
!**/.env.example
**/*.tsbuildinfo
.git
.pnpm-store
backups
coverage
~~~~

### docker-compose.yml (local development only)
~~~~yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bayana
      POSTGRES_PASSWORD: [REDACTED]
      # Only used when the volume is first created. Volumes created before Phase 1 keep
      # their original `bayana` database; run `pnpm.cmd db:create` to add bayana_dev/bayana_test.
      POSTGRES_DB: bayana_dev
    # Host port 5432 is occupied by another local PostgreSQL instance.
    # Keep PostgreSQL on 5432 inside Docker, but expose this project on 5433.
    ports: ["5433:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bayana -d postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
  mailpit:
    # Local SMTP sink: SMTP on 1025, web UI on http://localhost:8025
    image: axllent/mailpit:v1.21
    ports: ["1025:1025", "8025:8025"]
volumes:
  postgres_data:
~~~~

### docker/postgres/init/01-create-databases.sh
~~~~sh
#!/bin/sh
# Runs once, only when the data volume is first initialised. POSTGRES_DB (bayana_dev) is
# created by the image itself; this adds the test database. Existing volumes are untouched;
# use `pnpm.cmd db:create` for those.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
SELECT 'CREATE DATABASE bayana_test' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bayana_test')\gexec
SQL
~~~~

### render.yaml (UNCOMMITTED, from worktree C:\dev\bayana-phase11; predates Google sign-in)
~~~~yaml
# Render Blueprint for the Bayana API (SPEC 16.5). Values never live here: every variable marked `sync: false`
# is entered once in the Render dashboard when the Blueprint is applied. Steps and the per-environment matrix: docs/DEPLOY.md.
# Migrations are NOT run by Render (the free plan has no pre-deploy step); run them from your laptop with DATABASE_URL_DIRECT.
services:
  - type: web
    name: bayana-api-staging
    runtime: docker
    plan: free
    region: singapore
    branch: main
    autoDeploy: true
    # The image is built from the repository root so the pnpm workspace and @bayana/shared are available.
    dockerContext: .
    dockerfilePath: ./apps/api/Dockerfile
    healthCheckPath: /health
    # Only these paths trigger a rebuild; web-only changes do not redeploy the API.
    buildFilter:
      paths:
        - apps/api/**
        - packages/shared/**
        - package.json
        - pnpm-lock.yaml
        - pnpm-workspace.yaml
    envVars:
      # Fixed, non-secret values. Render injects PORT itself; the API reads it.
      - key: NODE_ENV
        value: production
      - key: TRUST_PROXY
        value: "1"
      # Entered in the dashboard (names only here).
      - key: APP_ENV
        sync: false
      - key: WEB_ORIGINS
        sync: false
      - key: SESSION_COOKIE_DOMAIN
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_URL_DIRECT
        sync: false
      - key: SESSION_SECRET
        sync: false
      - key: OTP_PEPPER
        sync: false
      - key: TICK_SECRET
        sync: false
      - key: OPS_EMAIL
        sync: false
      - key: EMAIL_TRANSPORT
        sync: false
      - key: SMTP_URL
        sync: false
      - key: EMAIL_FROM
        sync: false
      - key: PAYMENT_MODE
        sync: false
      - key: RAZORPAY_KEY_ID
        sync: false
      - key: RAZORPAY_KEY_SECRET
        sync: false
      - key: RAZORPAY_WEBHOOK_SECRET
        sync: false
      - key: HOLD_MINUTES
        sync: false
      - key: REQUEST_HOLD_HOURS
        sync: false
      - key: MIN_ADVANCE_PAISE
        sync: false
      # Deliberately absent: LIVE_PAYMENTS_ACK (live payments stay off until every SPEC 16.8 gate is done) and
      # PAYMENT_PROVIDER (defaults to razorpay; "fake" is refused outside tests). Google sign-in variables arrive
      # with the auth-google-signin branch; add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI here then.
~~~~

### vercel.json
Does not exist (in either worktree). Web deploy notes for Vercel live in the uncommitted DEPLOY.md above.

### apps/web/next.config.ts
~~~~ts
import type { NextConfig } from "next";
import { loadWebEnv } from "./env-schema";

// Fail `next dev` and `next build` early, with variable names only, when the public env is missing or invalid.
try { loadWebEnv(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid web environment"}\n`); process.exit(1); }
const dev = process.env.NODE_ENV !== "production";

// The Content-Security-Policy is set per request by middleware.ts (lib/csp.ts), so pages with account data get a nonce.
// These headers are the same on every response (SPEC 12.5). HSTS only when the site URL is HTTPS (staging, production).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Razorpay Checkout may open a UPI or bank window and needs to talk back to it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")' },
  ...(!dev && process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https:") ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : [])
];

// The dev indicator floats over page content and would leak into screenshot baselines.
// next dev keeps only 5 compiled pages by default; with ~25 routes under parallel tests it keeps disposing and
// recompiling them, and each recompile hot-swaps CSS under open pages. Dev-only; ignored by next build/start.
const nextConfig: NextConfig = {
  // The stylesheet (~10 KB) goes inside the HTML: on a slow phone connection the first paint no longer waits for a
  // separate render-blocking request (public page LCP, SPEC 18). Production builds only; the CSP allows inline styles.
  experimental: { inlineCss: true },
  reactStrictMode: true, devIndicators: false, onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 100 },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; }
};
export default nextConfig;
~~~~

### apps/web/middleware.ts
~~~~ts
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, sentryOrigin, usesNonce } from "@/lib/csp";

// Sets the Content-Security-Policy on every page. Next reads the nonce from the request's CSP header and adds it to its own
// scripts during per-request rendering (the strict pages export dynamic = "force-dynamic").
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://invalid.invalid").origin;
const sentry = sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
const dev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const nonce = usesNonce(request.nextUrl.pathname) ? btoa(crypto.randomUUID()) : null;
  const policy = contentSecurityPolicy({ nonce, apiOrigin, dev, sentry });
  const headers = new Headers(request.headers);
  if (nonce) { headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", policy); }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = { matcher: [{ source: "/((?!_next/static|_next/image|favicon|icon|brand/|.*\.(?:png|svg|jpg|webp|ico|txt|xml)$).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }] };
~~~~

### apps/web/lib/csp.ts (used by middleware.ts)
~~~~ts
// Content Security Policy (SPEC 12.5). Third parties: Razorpay Checkout (script, frames, API, images) and, only when
// NEXT_PUBLIC_SENTRY_DSN is set, Sentry's ingest host for error reports. Nothing else.

/** Pages that handle accounts or personal data render per request and get a nonce-based script policy. */
const STRICT = /^\/(login|signup|forgot|auth|onboarding|dashboard|admin|b|my-bookings|waking)(\/|$)|^\/[^/]+\/book(\/|$)/;
export const usesNonce = (pathname: string) => STRICT.test(pathname);

export const sentryOrigin = (dsn: string | undefined) => { try { return dsn ? new URL(dsn).origin : null; } catch { return null; } };

/**
 * With a nonce: only scripts carrying it (Next's own, which load the rest; 'strict-dynamic' extends trust to scripts they
 * add, such as Razorpay Checkout). Without one (static marketing pages and the cached public vendor page, which hold no
 * account data): inline scripts are allowed because cached HTML cannot carry a per-request nonce; sources stay restricted.
 */
export function contentSecurityPolicy(options: { nonce: string | null; apiOrigin: string; dev: boolean; sentry: string | null }) {
  const { nonce, apiOrigin, dev, sentry } = options;
  const scripts = nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts}${dev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
    // React and Radix set style attributes at runtime, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.razorpay.com",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} https://*.razorpay.com${sentry ? ` ${sentry}` : ""}${dev ? " ws: wss:" : ""}`,
    "frame-src https://*.razorpay.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Google sign-in is a top-level navigation to the API, never a form post.
    `form-action 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    // Only when the API itself is HTTPS (staging, production); a local production build talks to http://localhost.
    ...(!dev && apiOrigin.startsWith("https:") ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}
~~~~

### .github/workflows/ci.yml
~~~~yaml
name: CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: bayana
          POSTGRES_PASSWORD: [REDACTED]
          POSTGRES_DB: bayana_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U bayana -d bayana_test"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      # Throwaway CI-only values; no real secrets are needed to verify the build.
      APP_ENV: local
      WEB_ORIGINS: http://ci.invalid
      DATABASE_URL: postgres://[REDACTED]@127.0.0.1:5432/bayana_ci
      DATABASE_URL_TEST: postgres://[REDACTED]@127.0.0.1:5432/bayana_test
      SESSION_SECRET: [REDACTED]
      OTP_PEPPER: [REDACTED]
      EMAIL_TRANSPORT: smtp
      SMTP_URL: smtp://127.0.0.1:1025
      EMAIL_FROM: ci@example.test
      PAYMENT_MODE: disabled
      NEXT_PUBLIC_API_URL: http://api.ci.invalid
      NEXT_PUBLIC_SITE_URL: http://ci.invalid
    steps:
      # Full history, so the secret scan below covers every commit, not just the last one.
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # Known vulnerabilities in dependencies (SPEC 12.4): high or critical fails the build.
      - run: pnpm audit --audit-level=high
      # Secrets in any commit (SPEC 16.7 item 12). Rules: gitleaks defaults plus .gitleaks.toml (exact test values only).
      - name: Secret scan (gitleaks)
        run: docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.24.3 git /repo --redact --no-banner --config /repo/.gitleaks.toml
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm db:migrate:test
      - run: pnpm test
      - run: pnpm build
~~~~

### .github/workflows/tick.yml
~~~~yaml
name: Jobs tick
# Calls POST /internal/jobs/tick: expire holds, retry webhooks, queue 24-hour reminders, send the email outbox (SPEC 15.3).
# OFF until you set the repository variable JOBS_ENABLED=true (Settings > Secrets and variables > Actions > Variables)
# and add the secrets API_URL (for example https://api.bayana.in, no trailing slash) and TICK_SECRET (same value as the API's).
# GitHub's scheduler is best-effort and may run late or skip; every job is safe to run late or twice.
on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:
permissions: {}
concurrency:
  group: jobs-tick
  cancel-in-progress: false
jobs:
  tick:
    if: ${{ vars.JOBS_ENABLED == 'true' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Call the tick endpoint
        env:
          API_URL: ${{ secrets.API_URL }}
          TICK_SECRET: ${{ secrets.TICK_SECRET }}
        run: |
          if [ -z "$API_URL" ] || [ -z "$TICK_SECRET" ]; then echo "Set the API_URL and TICK_SECRET repository secrets first."; exit 1; fi
          # A sleeping free instance takes about a minute to wake, so allow a long first response and a few retries.
          curl --silent --show-error --fail-with-body --retry 3 --retry-delay 20 --retry-all-errors --max-time 150 \
            -X POST -H "Authorization: Bearer $TICK_SECRET" "$API_URL/internal/jobs/tick"
~~~~

### .github/workflows/nightly.yml
~~~~yaml
name: Jobs nightly
# Calls POST /internal/jobs/nightly: reconcile payments with Razorpay (48 hours), retention cleanup, consistency checks (SPEC 15.3, 17.4, 17.6).
# OFF until the repository variable JOBS_ENABLED=true is set; needs the API_URL and TICK_SECRET secrets (see tick.yml).
on:
  schedule:
    - cron: "30 21 * * *" # 03:00 India time
  workflow_dispatch:
permissions: {}
concurrency:
  group: jobs-nightly
  cancel-in-progress: false
jobs:
  nightly:
    if: ${{ vars.JOBS_ENABLED == 'true' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Call the nightly endpoint
        env:
          API_URL: ${{ secrets.API_URL }}
          TICK_SECRET: ${{ secrets.TICK_SECRET }}
        run: |
          if [ -z "$API_URL" ] || [ -z "$TICK_SECRET" ]; then echo "Set the API_URL and TICK_SECRET repository secrets first."; exit 1; fi
          curl --silent --show-error --fail-with-body --retry 3 --retry-delay 30 --retry-all-errors --max-time 300 \
            -X POST -H "Authorization: Bearer $TICK_SECRET" "$API_URL/internal/jobs/nightly"
~~~~

### .github/workflows/backup.yml (UNCOMMITTED, from worktree C:\dev\bayana-phase11)
~~~~yaml
name: Database backup
# Nightly logical backup (SPEC 17.3): pg_dump over the DIRECT Neon URL -> verify -> encrypt with age -> upload to
# Cloudflare R2 (S3 API). Retention: daily/ keeps 7, weekly/ keeps 4 (set as R2 lifecycle rules, see docs/RESTORE.md).
#
# DISABLED. It does nothing until BOTH are done:
#   1. Uncomment the schedule below.
#   2. Set the repository variable BACKUPS_ENABLED=true (Settings > Secrets and variables > Actions > Variables).
# Even a manual run is skipped while BACKUPS_ENABLED is not true. Required secrets (names only; values never in the repo):
#   BACKUP_DATABASE_URL    Neon DIRECT connection string (no -pooler), ideally a read-only role
#   BACKUP_AGE_RECIPIENT   age PUBLIC key (age1...); the private key stays offline in your password manager
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   an R2 token limited to that one bucket
# Restoring: docs/RESTORE.md and scripts/restore.mjs.
on:
  # schedule:
  #   - cron: "30 21 * * *" # 03:00 IST
  workflow_dispatch:
permissions: {}
concurrency:
  group: database-backup
  cancel-in-progress: false
env:
  # Must be >= the Neon server's major version; check it with pnpm.cmd db:check-neon.
  PG_MAJOR: "16"
jobs:
  backup:
    if: ${{ vars.BACKUPS_ENABLED == 'true' }}
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Check configuration (names only)
        env:
          BACKUP_DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}
          BACKUP_AGE_RECIPIENT: ${{ secrets.BACKUP_AGE_RECIPIENT }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
        run: |
          missing=0
          for name in BACKUP_DATABASE_URL BACKUP_AGE_RECIPIENT R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
            if [ -z "${!name}" ]; then echo "Missing secret: $name"; missing=1; fi
          done
          case "$BACKUP_DATABASE_URL" in *-pooler*) echo "BACKUP_DATABASE_URL must be the DIRECT URL, not the -pooler one"; missing=1;; esac
          case "$BACKUP_AGE_RECIPIENT" in age1*) ;; *) echo "BACKUP_AGE_RECIPIENT must be an age public key (age1...)"; missing=1;; esac
          exit $missing

      - name: Install pg_dump ${{ env.PG_MAJOR }} and age
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq postgresql-common age
          sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
          sudo apt-get install -y -qq "postgresql-client-$PG_MAJOR"
          "/usr/lib/postgresql/$PG_MAJOR/bin/pg_dump" --version

      - name: Dump, verify and encrypt
        env:
          BACKUP_DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}
          BACKUP_AGE_RECIPIENT: ${{ secrets.BACKUP_AGE_RECIPIENT }}
        run: |
          set -euo pipefail
          umask 077
          bin="/usr/lib/postgresql/$PG_MAJOR/bin"
          name="bayana-$(date -u +%Y%m%dT%H%MZ).dump"
          "$bin/pg_dump" --format=custom --no-owner --no-privileges --file "$RUNNER_TEMP/$name" "$BACKUP_DATABASE_URL"
          # A dump that pg_restore cannot list is not a backup.
          entries=$("$bin/pg_restore" --list "$RUNNER_TEMP/$name" | grep -cv '^;')
          echo "Archive entries: $entries"
          age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$RUNNER_TEMP/$name.age" "$RUNNER_TEMP/$name"
          rm -f "$RUNNER_TEMP/$name"
          (cd "$RUNNER_TEMP" && sha256sum "$name.age" > "$name.age.sha256")
          echo "BACKUP_NAME=$name.age" >> "$GITHUB_ENV"

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
        run: |
          set -euo pipefail
          endpoint="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
          prefixes="daily"
          # Sunday's copy is also kept as a weekly one.
          if [ "$(date -u +%u)" = "7" ]; then prefixes="daily weekly"; fi
          for prefix in $prefixes; do
            for file in "$BACKUP_NAME" "$BACKUP_NAME.sha256"; do
              aws s3 cp --only-show-errors --endpoint-url "$endpoint" "$RUNNER_TEMP/$file" "s3://$R2_BUCKET/$prefix/$file"
            done
            echo "Uploaded $prefix/$BACKUP_NAME"
          done

      - name: Remove local copies
        if: always()
        run: rm -f "$RUNNER_TEMP"/bayana-*.dump "$RUNNER_TEMP"/bayana-*.dump.age "$RUNNER_TEMP"/bayana-*.sha256
~~~~

---

## 5. API entry point and app setup

Summary of where each concern lives:

| Concern | Where | What |
|---|---|---|
| Entry point | `apps/api/src/server.ts` | `app.listen(config.PORT)`, no host binding (all interfaces) |
| Env validation | `apps/api/src/config.ts` → `config-schema.ts` | `dotenv/config`, Zod, exit 1 on any problem |
| Trust proxy | `apps/api/src/app.ts:27` | `app.set("trust proxy", config.TRUST_PROXY)` (hop count) |
| Helmet / CSP | `apps/api/src/app.ts:30` | `default-src 'none'`, `frame-ancestors 'none'`, CORP same-site |
| CORS | `apps/api/src/app.ts:31` | `origin: config.WEB_ORIGINS`, `credentials: true` |
| Raw-body webhook | `apps/api/src/app.ts:33-41` | `POST /webhooks/razorpay` with `express.raw`, mounted **before** `express.json`; processing deferred with `setImmediate` (retried by tick if it crashes, per HANDOFF) |
| Origin check (CSRF) | `apps/api/src/origin-check.ts` | rejects unsafe methods with a foreign `Origin` or `Sec-Fetch-Site: cross-site`; exempts `/internal/jobs/` and `/webhooks/` |
| Rate limit | `apps/api/src/app.ts:44` | global 300 req / 15 min per IP (relies on trust proxy for the real IP) |
| Health / ready | `apps/api/src/app.ts:45-46` | `/health` static `{ok:true}`; `/ready` runs `SELECT 1` → 503 on failure |
| Jobs | `apps/api/src/app.ts:59-68` | `POST /internal/jobs/tick|nightly`, Bearer TICK_SECRET, 503 if unset |
| Session cookie | `apps/api/src/auth-routes.ts:28-30` | `bayana_session`, httpOnly, SameSite=Lax, Secure when NODE_ENV=production, path `/`, Domain from SESSION_COOKIE_DOMAIN if set, 30-day maxAge |
| Google state cookie | `apps/api/src/google/routes.ts:20` | same options, path `/v1/auth/google`, 10 minutes, signed |
| DB pool | `apps/api/src/database.ts:3` | `new pg.Pool({ connectionString: DATABASE_URL })`, default pool size, **no explicit SSL options** (relies on `sslmode` in the URL) |
| Migrations | `apps/api/src/migrate.ts` + `migration-runner.ts` | `pg.Client` on DATABASE_URL_DIRECT, session `pg_advisory_lock`, one transaction per file, checksums |
| Logging | `apps/api/src/logger.ts` | pino JSON, key-based redaction |

### apps/api/src/server.ts
~~~~ts
import { app } from "./app.js";
import { config } from "./config.js";
import { log } from "./logger.js";

app.listen(config.PORT, () => log("info", "server.started", { port: config.PORT }));
~~~~

### apps/api/src/config.ts
~~~~ts
import "dotenv/config";
import { loadConfig, type Config } from "./config-schema.js";

export { ConfigError, databaseNameProblem, loadConfig, type Config } from "./config-schema.js";

function loadConfigOrExit(): Config {
  try { return loadConfig(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Invalid environment"}\n`); process.exit(1); }
}
export const config = loadConfigOrExit();
~~~~

### apps/api/src/app.ts
~~~~ts
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { pool } from "./database.js";
import { currentUser, type SessionUser } from "./auth.js";
import { authRouter, cookieToken } from "./auth-routes.js";
import { bookingRouter, customerBookings } from "./booking-routes.js";
import { publicRouter } from "./public-routes.js";
import { vendorRouter } from "./vendor-routes.js";
import { dashboardRouter, icalRouter } from "./dashboard-routes.js";
import { adminRouter } from "./admin-routes.js";
import { googleRouter } from "./google/routes.js";
import { privacyRouter } from "./privacy.js";
import { processWebhookEvent, receiveWebhook } from "./payments/webhooks.js";
import helmet from "helmet";
import { runNightly, runTick, tickAuthorized } from "./jobs.js";
import { log, requestId } from "./logger.js";
import { errorBody, errorHandler, notFoundHandler } from "./errors.js";
import { originCheck } from "./origin-check.js";

export const app = express();
const userFor = (req: express.Request) => currentUser(pool, cookieToken(req));
const requireUser = async (req: express.Request, res: express.Response, role?: SessionUser["role"]) => { const user = await userFor(req); if (!user || (role && user.role !== role)) { res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in is required", details: {} } }); return null; } return user; };

app.disable("x-powered-by");
app.set("trust proxy", config.TRUST_PROXY);
app.use((req, res, next) => { res.locals.requestId = requestId(); res.setHeader("x-request-id", res.locals.requestId); next(); });
// A JSON API: nothing it returns should ever run or embed anything. Receipts and the calendar feed are downloads.
app.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } }, crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors({ origin: config.WEB_ORIGINS, credentials: true }));
// Razorpay webhooks need the raw body for the signature, so this route is mounted before express.json (SPEC 11.3).
app.post("/webhooks/razorpay", express.raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
  try {
    const result = await receiveWebhook(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.header("x-razorpay-signature"), req.header("x-razorpay-event-id"));
    res.status(result.status).json(result.body);
    // Answer first (Razorpay waits 5 seconds at most), then apply the event.
    const eventId = result.process;
    if (eventId) setImmediate(() => { processWebhookEvent(eventId).catch(error => log("error", "webhook.processing_crashed", { eventId, err: error instanceof Error ? error.message : String(error) })); });
  } catch (errorValue) { next(errorValue); }
});
app.use(originCheck);
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", async (_req, res) => { try { await pool.query("SELECT 1"); res.json({ ok: true }); } catch (errorValue) { log("error", "ready.database_unreachable", { requestId: res.locals.requestId, err: errorValue instanceof Error ? errorValue.message : String(errorValue) }); res.status(503).json(errorBody("NOT_READY", "Database is not reachable")); } });

app.use("/v1/auth", authRouter);
app.use("/v1/auth", googleRouter);
app.use("/v1/vendors", publicRouter);
app.use("/v1/vendor", vendorRouter);
app.use("/v1/vendor", dashboardRouter);
app.use("/v1/ical", icalRouter);
app.use("/v1/admin", adminRouter);
app.use("/v1/client", privacyRouter);
app.use("/v1/bookings", bookingRouter);

// Scheduled jobs (SPEC 15.3), called by GitHub Actions with Authorization: Bearer <TICK_SECRET>.
app.post("/internal/jobs/:kind", async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (kind !== "tick" && kind !== "nightly") return notFoundHandler(req, res);
    if (!config.TICK_SECRET) return res.status(503).json(errorBody("JOBS_NOT_CONFIGURED", "TICK_SECRET is not set"));
    if (!tickAuthorized(req.header("authorization"))) return res.status(401).json(errorBody("AUTHENTICATION_REQUIRED", "A valid job secret is required"));
    const result = kind === "tick" ? await runTick() : await runNightly();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (errorValue) { next(errorValue); }
});

app.get("/v1/client/bookings", async (req, res, next) => { try { const user = await requireUser(req, res, "CLIENT"); if (!user) return; res.json({ bookings: await customerBookings(user) }); } catch (errorValue) { next(errorValue); } });
app.use(notFoundHandler);
app.use(errorHandler);
~~~~

### apps/api/src/origin-check.ts
~~~~ts
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { errorBody } from "./errors.js";

// CSRF defence in depth (SPEC 12.4/12.5), on top of SameSite=Lax session cookies. A state-changing request that a browser
// marks as coming from another site, or whose Origin is not one of our web origins, is refused before any handler runs.
// Server-to-server callers send no Origin: the Razorpay webhook (mounted before this, raw body) and the job runner
// (Bearer secret) are exempt by path.
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export function originCheck(req: Request, res: Response, next: NextFunction) {
  if (!unsafe.has(req.method) || req.path.startsWith("/internal/jobs/") || req.path.startsWith("/webhooks/")) return next();
  const origin = req.header("origin"), site = req.header("sec-fetch-site");
  const badOrigin = origin !== undefined && (origin === "null" || !config.WEB_ORIGINS.includes(origin));
  if (badOrigin || site === "cross-site") return res.status(403).json(errorBody("ORIGIN_NOT_ALLOWED", "This request did not come from Bayana"));
  next();
}
~~~~

### Session cookie settings (excerpt, apps/api/src/auth-routes.ts:28-30, apps/api/src/auth.ts:13)
~~~~ts
export const sessionCookieName = "bayana_session";   // auth.ts:13
export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: config.NODE_ENV === "production", path: "/", ...(config.SESSION_COOKIE_DOMAIN ? { domain: config.SESSION_COOKIE_DOMAIN } : {}) });
const setSessionCookie = (res: Response, token: string) => res.cookie(sessionCookieName, token, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60_000 });
const clearSessionCookie = (res: Response) => res.clearCookie(sessionCookieName, cookieOptions());
~~~~

### apps/api/src/database.ts
~~~~ts
import { Pool, type PoolClient } from "pg";
import { config } from "./config.js";
export const pool = new Pool({ connectionString: config.DATABASE_URL });
export function assertTestDatabase(url: string) { if (!new URL(url).pathname.endsWith("_test")) throw new Error("Tests require DATABASE_URL to name a database ending in _test"); }
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL);
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) { const client = await pool.connect(); try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
~~~~

### apps/api/src/migrate.ts
~~~~ts
import { Client } from "pg";
import { config, databaseNameProblem } from "./config.js";
import { assertTestDatabase } from "./database.js";
import { loadMigrationFiles, migrationRefusal, pendingMigrations, runMigrations } from "./migration-runner.js";

// Migrations use the direct (unpooled) connection; advisory locks do not survive a transaction-mode pooler.
if (config.NODE_ENV === "test") assertTestDatabase(config.DATABASE_URL_DIRECT);
const statusOnly = process.argv.includes("--status");
const target = new URL(config.DATABASE_URL_DIRECT);
const databaseName = decodeURIComponent(target.pathname.slice(1));
const files = await loadMigrationFiles(new URL("../sql/", import.meta.url));
const client = new Client({ connectionString: config.DATABASE_URL_DIRECT });
await client.connect();
try {
  const pending = await pendingMigrations(client, files);
  process.stdout.write(`Database "${databaseName}" (NODE_ENV=${config.NODE_ENV}): ${pending.length ? `${pending.length} pending migration${pending.length > 1 ? "s" : ""}:\n${pending.map(name => `  - ${name}`).join("\n")}` : "no pending migrations."}\n`);
  const problem = statusOnly ? null : databaseNameProblem(config.DATABASE_URL_DIRECT, config.NODE_ENV);
  if (statusOnly) {
    // --status only reports; it never writes.
  } else if (problem) {
    const variable = config.NODE_ENV === "test" ? "DATABASE_URL_TEST" : process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
    process.stderr.write(`${migrationRefusal(variable, databaseName, problem, config.NODE_ENV)}\n`);
    process.exitCode = 1;
  } else {
    // Runs even with nothing pending: runMigrations re-verifies every applied file's checksum.
    await client.query("SELECT pg_advisory_lock(4815162342)");
    try { await runMigrations(client, files); } finally { await client.query("SELECT pg_advisory_unlock(4815162342)").catch(() => undefined); }
    process.stdout.write(pending.length ? `Applied ${pending.length} migration${pending.length > 1 ? "s" : ""}.\n` : "Checksums of applied migrations verified.\n");
  }
} finally {
  await client.end();
}
~~~~

### apps/api/src/migration-runner.ts
~~~~ts
import { readFile, readdir } from "node:fs/promises";
import type { ClientBase } from "pg";
import { log } from "./logger.js";
import { assertAppliedChecksum, migrationChecksum } from "./migration-checksums.js";

export type MigrationFile = { name: string; sql: string };
export type MigrationRow = { name: string; checksum: string | null; applied_at: Date };
const tablePattern = /^(pg_temp\.)?[a-z_][a-z0-9_]*$/;

export async function loadMigrationFiles(directory: URL): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async name => ({ name, sql: await readFile(new URL(name, directory), "utf8") })));
}

/** The message db:migrate prints when the target database's name does not match NODE_ENV. Names only, never the URL (it holds a password). */
export function migrationRefusal(variable: string, databaseName: string, problem: string, nodeEnv: string) {
  return [
    `Refusing to migrate: ${variable} ${problem}. It currently names database "${databaseName}". Nothing was changed.`,
    ...(nodeEnv === "development" ? [
      "To keep your data and move it to bayana_dev (Windows PowerShell, from the repository root):",
      `  1. Back up:   docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/${databaseName}.dump ${databaseName}`,
      `                docker cp bayana-postgres-1:/tmp/${databaseName}.dump backups\\${databaseName}.dump`,
      "  2. Point DATABASE_URL in apps/api/.env at .../bayana_dev, then run: pnpm.cmd db:create",
      `  3. Restore:   docker exec bayana-postgres-1 pg_restore -U bayana -d bayana_dev /tmp/${databaseName}.dump`,
      "  4. Migrate:   pnpm.cmd db:migrate"
    ] : [])
  ].join("\n");
}

/** Read-only: names of files not yet recorded in the migrations table (all of them if the table does not exist yet). */
export async function pendingMigrations(client: ClientBase, files: MigrationFile[], table = "schema_migrations"): Promise<string[]> {
  if (!tablePattern.test(table)) throw new Error("Invalid migrations table name");
  const exists = (await client.query<{ name: string | null }>("SELECT to_regclass($1) AS name", [table])).rows[0].name;
  if (!exists) return files.map(file => file.name);
  const applied = new Set((await client.query<{ name: string }>(`SELECT name FROM ${table}`)).rows.map(row => row.name));
  return files.map(file => file.name).filter(name => !applied.has(name));
}

/** Applies pending files in order, each in its own transaction. Fails before applying anything new if an applied file changed. */
export async function runMigrations(client: ClientBase, files: MigrationFile[], options: { table?: string; statusOnly?: boolean } = {}): Promise<MigrationRow[]> {
  const table = options.table ?? "schema_migrations";
  if (!tablePattern.test(table)) throw new Error("Invalid migrations table name");
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checksum text`);
  const applied = new Map((await client.query<{ name: string; checksum: string | null }>(`SELECT name,checksum FROM ${table}`)).rows.map(row => [row.name, row.checksum]));
  for (const file of files) if (applied.has(file.name)) assertAppliedChecksum(file.name, applied.get(file.name) ?? null, file.sql);
  for (const file of files) {
    const hash = migrationChecksum(file.sql);
    if (applied.has(file.name)) {
      if (!applied.get(file.name)) { await client.query(`UPDATE ${table} SET checksum=$2 WHERE name=$1`, [file.name, hash]); log("warn", "migration.checksum_backfilled", { name: file.name }); }
      continue;
    }
    if (options.statusOnly) continue;
    await client.query("BEGIN");
    try { await client.query(file.sql); await client.query(`INSERT INTO ${table}(name,checksum) VALUES($1,$2)`, [file.name, hash]); await client.query("COMMIT"); log("info", "migration.applied", { name: file.name }); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
  }
  return (await client.query<MigrationRow>(`SELECT name,checksum,applied_at FROM ${table} ORDER BY name`)).rows;
}
~~~~

### apps/api/src/logger.ts
~~~~ts
import { randomUUID } from "node:crypto";
import { pino, type DestinationStream, type Logger } from "pino";

const sensitive = /authorization|cookie|password|secret|token|otp|pepper|signature|^code$/i;
export const requestId = () => randomUUID();
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(entry)]));
  return value;
}
export function createLogger(destination?: DestinationStream, level = process.env.NODE_ENV === "test" ? "silent" : "info"): Logger {
  const options = { level, base: undefined, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (label: string) => ({ level: label }) } };
  return destination ? pino(options, destination) : pino(options);
}
let logger = createLogger();
/** Test hook: route log output to a capture stream. */
export function setLogger(next: Logger) { logger = next; }
export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) { logger[level]({ event, ...(redact(fields) as Record<string, unknown>) }); }
~~~~

---

## 6. Migrations

Directory: `apps/api/sql/` (forward-only, numbered). Applied to both `bayana_dev` and `bayana_test` (001–019).

```
001_init.sql
002_auth_payments.sql
003_universal_booking.sql
004_migration_checksums.sql
005_authentication.sql
006_domain_alignment.sql
007_vendor_onboarding.sql
008_availability.sql
009_remove_legacy_booking_uniqueness.sql
010_customer_booking.sql
011_auth.sql
012_vendor_setup.sql
013_booking_engine.sql
014_booking_contracts.sql
015_payments.sql
016_notifications.sql
017_dashboard_admin.sql
018_auth_identities.sql
019_consents.sql
```

**Runner:** a custom runner, no third-party tool. `apps/api/src/migrate.ts` (CLI) plus `apps/api/src/migration-runner.ts` (logic). It reads `../sql/` relative to the compiled file, records `schema_migrations(name, applied_at, checksum)`, runs each pending file in its own transaction, refuses if an applied file's checksum changed, and refuses when the database name does not match NODE_ENV.
- Scripts: `pnpm db:migrate` → `tsx src/migrate.ts` (needs devDependency `tsx`); `pnpm db:migrate:status` → `--status`; `pnpm db:migrate:test` → creates `_test` DB then migrates.
- Uses `DATABASE_URL_DIRECT` (required in production) and a **session-level** `pg_advisory_lock(4815162342)`, which is why it must not go through a transaction-mode pooler.
- In the API Docker image, `sql/` is copied to `dist/sql`, so `node dist/src/migrate.js` works inside the image. Render runs no migrations: render.yaml says to run them from a laptop with the direct URL.

---

## 7. Command output (last 30 lines each)

Run on 2026-10-25 from the repo root, Windows PowerShell host, local Docker Postgres and Mailpit up. Note: the developer's `pnpm dev` (web 3000, API 4000) was running at the same time.

| Command | Exit code | Notes |
|---|---|---|
| `pnpm.cmd doctor` | 0 | |
| `pnpm.cmd typecheck` | 0 | |
| `pnpm.cmd lint` | 0 | `lint` is `tsc --noEmit` in every package (no ESLint configured) |
| `pnpm.cmd test` | **1** | unit 91/91 passed; integration 162/163: `payments.test.ts` > "webhooks (PY-04) > tolerates any order…" failed (`error: "Waiting for payment …"` instead of `null` at `test/integration/payments.test.ts:209`). Rerun alone 3 times: 20/20 passed each time. **Flaky under load** (the run overlapped a running `pnpm dev`), not deterministic, but not fixed. |
| `pnpm.cmd build` | **1** in the working repo | API and shared built. `next build` failed at "Collecting build traces" with `ENOENT … apps/web/.next/server/app/icon.svg/route.js.nft.json`. The developer's `next dev` was writing the same `.next` folder at the time. |
| `pnpm.cmd build` (clean export of HEAD) | **0** | `git archive HEAD` into a temp folder, `pnpm install --frozen-lockfile --offline`, build with placeholder `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SITE_URL`: all three packages built. Tail shown below as "build (clean export)". |

### pnpm.cmd doctor
~~~~text

~~~~

### pnpm.cmd typecheck
~~~~text

> bayana@ typecheck C:\dev\Bayana
> pnpm --filter @bayana/shared build && pnpm -r typecheck


> @bayana/shared@0.1.0 build C:\dev\Bayana\packages\shared
> tsc -p tsconfig.json

Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit -p tsconfig.json
packages/shared typecheck: Done
apps/web typecheck$ tsc --noEmit
apps/api typecheck$ tsc --noEmit -p tsconfig.json
apps/web typecheck: Done
apps/api typecheck: Done
~~~~

### pnpm.cmd lint
~~~~text

> bayana@ lint C:\dev\Bayana
> pnpm --filter @bayana/shared build && pnpm -r lint


> @bayana/shared@0.1.0 build C:\dev\Bayana\packages\shared
> tsc -p tsconfig.json

Scope: 3 of 4 workspace projects
packages/shared lint$ tsc --noEmit -p tsconfig.json
packages/shared lint: Done
apps/api lint$ tsc --noEmit -p tsconfig.json
apps/web lint$ tsc --noEmit
apps/web lint: Done
apps/api lint: Done
~~~~

### pnpm.cmd test
~~~~text

- Expected
+ Received

  {
-   "error": null,
+   "error": "Waiting for payment pay_fake_fake000001mvnjhj7o7zer",
  }

 ❯ test/integration/payments.test.ts:209:42
    207|     const paid = await webhook("order.paid", { payment, order: { id: o…
    208|     const captured = await webhook("payment.captured", { payment }); a…
    209|     expect(await settled(early.eventId)).toMatchObject({ error: null }…
       |                                          ^
    210|     expect(await counts(booking.id)).toEqual({ captured: 0, ledger: 1,…
    211|     expect((await pool.query("SELECT status FROM payments WHERE provid…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 11 passed (12)
      Tests  1 failed | 162 passed (163)
   Start at  13:31:07
   Duration  73.93s (transform 1.15s, setup 338ms, import 14.44s, tests 54.95s, environment 2ms)

C:\dev\Bayana\apps\api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @bayana/api@0.1.0 test:integration: `pnpm run migrate:test && cross-env NODE_ENV=test PAYMENT_MODE=disabled RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= EMAIL_TRANSPORT=capture TRUST_PROXY=1 TICK_SECRET=[REDACTED] OPS_EMAIL=ops@example.test vitest run test/integration`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
 ELIFECYCLE  Test failed. See above for more details.
~~~~

### pnpm.cmd build (working repo, failed)
~~~~text
packages/shared build: Done
apps/api build$ tsc -p tsconfig.json
apps/web build$ next build
apps/web build:    ▲ Next.js 15.5.28
apps/web build:    - Environments: .env.local
apps/web build:    - Experiments (use with caution):
apps/web build:      ✓ inlineCss
apps/web build:    Creating an optimized production build ...
apps/api build: Done
apps/web build:  ✓ Compiled successfully in 66s
apps/web build:    Linting and checking validity of types ...
apps/web build:    Collecting page data ...
apps/web build:    Generating static pages (0/11) ...
apps/web build:    Generating static pages (2/11) 
apps/web build:    Generating static pages (5/11) 
apps/web build:    Generating static pages (8/11) 
apps/web build:  ✓ Generating static pages (11/11)
apps/web build:    Finalizing page optimization ...
apps/web build:    Collecting build traces ...
apps/web build: [Error: ENOENT: no such file or directory, open 'C:\dev\Bayana\apps\web\.next\server\app\icon.svg\route.js.nft.json'] {
apps/web build:   errno: -4058,
apps/web build:   code: 'ENOENT',
apps/web build:   syscall: 'open',
apps/web build:   path: 'C:\\dev\\Bayana\\apps\\web\\.next\\server\\app\\icon.svg\\route.js.nft.json'
apps/web build: }
apps/web build: Failed
C:\dev\Bayana\apps\web:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @bayana/web@0.1.0 build: `next build`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
~~~~

### pnpm.cmd build (clean export of HEAD, passed)
~~~~text
apps/web build: ├ ƒ /dashboard                           4.52 kB         183 kB
apps/web build: ├ ƒ /dashboard/availability              10.4 kB         173 kB
apps/web build: ├ ƒ /dashboard/bookings                   2.9 kB         182 kB
apps/web build: ├ ƒ /dashboard/bookings/[id]             4.53 kB         184 kB
apps/web build: ├ ƒ /dashboard/calendar                  4.93 kB         184 kB
apps/web build: ├ ƒ /dashboard/customers                    7 kB         159 kB
apps/web build: ├ ƒ /dashboard/payments                  4.39 kB         156 kB
apps/web build: ├ ƒ /dashboard/services                  3.47 kB         180 kB
apps/web build: ├ ƒ /dashboard/settings                  11.8 kB         189 kB
apps/web build: ├ ○ /design                              13.1 kB         184 kB
apps/web build: ├ ƒ /forgot                              8.14 kB         168 kB
apps/web build: ├ ○ /icon.svg                                0 B            0 B
apps/web build: ├ ƒ /login                               8.45 kB         155 kB
apps/web build: ├ ƒ /my-bookings                         4.12 kB         170 kB
apps/web build: ├ ƒ /onboarding                          4.17 kB         159 kB
apps/web build: ├ ○ /pricing                               175 B         106 kB
apps/web build: ├ ○ /privacy                               175 B         106 kB
apps/web build: ├ ○ /refunds                               175 B         106 kB
apps/web build: ├ ƒ /signup                              8.33 kB         155 kB
apps/web build: ├ ○ /terms                                 175 B         106 kB
apps/web build: └ ƒ /waking                              3.59 kB         137 kB
apps/web build: + First Load JS shared by all             102 kB
apps/web build:   ├ chunks/20b19d27-cad746e70e231dc3.js  54.2 kB
apps/web build:   ├ chunks/9461-1826a80accab80c3.js      46.2 kB
apps/web build:   └ other shared chunks (total)             2 kB
apps/web build: ƒ Middleware                             34.6 kB
apps/web build: ○  (Static)   prerendered as static content
apps/web build: ●  (SSG)      prerendered as static HTML (uses generateStaticParams)
apps/web build: ƒ  (Dynamic)  server-rendered on demand
apps/web build: Done
~~~~

### Production start commands (not dev mode)

| | API (`apps/api`) | Web (`apps/web`) |
|---|---|---|
| Build | `pnpm --filter @bayana/shared build && pnpm --filter @bayana/api build` (`tsc` → `apps/api/dist/src/*.js`) | `pnpm --filter @bayana/web build` (`next build`; needs `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` at build time) |
| Start on a host | `node dist/src/server.js` (= `pnpm --filter @bayana/api start`), env from the host; listens on `PORT` | `pnpm --filter @bayana/web start` (= `next start`, honours `PORT`). On Vercel, Vercel runs the build and serves it. |
| Migrate | `pnpm db:migrate` (tsx, devDependency) with `DATABASE_URL_DIRECT`; inside the Docker image `node dist/src/migrate.js` | – |
| Docker | `docker build -f apps/api/Dockerfile .` → `CMD node dist/src/server.js`, `NODE_ENV=production`, user `node`, port 4000 | `apps/web/Dockerfile` → `pnpm --filter @bayana/web start` |

**Is the artifact runnable? (verified from the clean export, 2026-10-25):**
- **API: yes.** `node dist/src/server.js` with `PORT=4999` and the local development env started (`server.started`, port 4999). `GET /health` → `{"ok":true}` and `GET /ready` → `{"ok":true}` (database reachable). Not tested under `NODE_ENV=production`, which also needs `DATABASE_URL_DIRECT`, `OTP_PEPPER`, `TICK_SECRET` and a database not named `_dev`/`_test`.
- **API caveat:** plain `tsc` output has **no `dist/sql`**, so `node dist/src/migrate.js` works only inside the Docker image (whose Dockerfile copies `apps/api/sql` to `dist/sql`). Outside Docker, migrate with `pnpm db:migrate` (tsx).
- **Web: yes, with env at start time too.** `next start` **exits immediately** unless `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` are set at runtime as well, because `next.config.ts` re-validates them on start. With both set: `/`, `/login`, `/pricing`, `/waking`, `/terms` → 200; `/login` carries a nonce CSP and `X-Frame-Options: DENY`.
- **Web Docker caveat (not executed):** `.dockerignore` excludes `.env.*`, and `apps/web/Dockerfile` declares no `ARG`/`ENV` for `NEXT_PUBLIC_*`, so `next build` inside that image would fail the env check as written. The image also copies the whole build stage, including dev dependencies. Vercel, the intended web host, is unaffected.
- Docker images were not built in this session.

---

## 8. Grep report

Scope: runtime source only: `apps/api/src`, `apps/web/{app,components,lib}`, `apps/web/{middleware,next.config,env-schema}.ts`, `packages/shared/src`. Tests, scripts and docs are excluded.

**Hardcoded localhost or ports:** none in runtime logic. Every hit is example text inside an error or help message describing the expected format:
- `apps/api/src/config-schema.ts:26,27,31,35`: `allowedValues` help strings (`http://localhost:3000`, a local postgres URL example on 5433, `smtp://localhost:1025`, `http://localhost:4000/v1/auth/google/callback`).
- `apps/api/src/check-env.ts:18`: help string with a local `_test` URL example.
- `apps/web/env-schema.ts:9,10`: help strings (`http://localhost:4000`, `http://localhost:3000`).
- `apps/web/lib/csp.ts:33`: a comment.
- `apps/web/middleware.ts:6`: fallback `http://invalid.invalid` if `NEXT_PUBLIC_API_URL` is unset (not localhost).
- `PORT` defaults to 4000 in the schema; Render injects `PORT`.

**Writes to local disk (fs writes, uploads, multer):** none in runtime source. The only fs use is `readFile`/`readdir` in `migration-runner.ts` and `readFileSync` in `check-env.ts` (a doctor helper). Receipts (pdf-lib) and iCal are generated in memory and streamed.

**`pg_advisory_lock` (session-level):** `apps/api/src/migrate.ts:26-27` only (migration CLI, on DATABASE_URL_DIRECT). Runtime uses `pg_advisory_xact_lock` at `apps/api/src/booking-transition.ts:70`.

**`SET` without `LOCAL`:** none found.

**`LISTEN` / `NOTIFY` / `pg_notify`:** none found.

**Process timers:**
- `apps/api/src/app.ts:39`: `setImmediate` to process a verified webhook after replying 200. Not a correctness dependency: the event is stored first, and HANDOFF says tick retries unprocessed webhooks.
- `apps/api/src/notifications/outbox.ts:67`: `setImmediate` "kick" to send urgent mail right after commit. The outbox row is durable; tick sends anything left.
- `apps/api/src/jobs-cli.ts:12`: 1.5 s `setTimeout` in the local CLI before closing the pool (not used when deployed).
- Web (client-side UI only): polling and countdowns in `app/(public)/b/[id]/booking-page.tsx:42`, `app/(public)/waking/waking-status.tsx:16,19`, `app/(public)/[slug]/book/booking-flow.tsx:188`, `components/auth/auth-fields.tsx:38`, `components/booking/countdown.tsx:14`, `components/booking/payment-panel.tsx:33,39`, `app/design/gallery.tsx:59` (demo page).
- No `setInterval` or cron in the API. Hold expiry is lazy inside booking transactions; scheduled work goes through `POST /internal/jobs/tick|nightly`.

**`console.log` (or other `console.*`) in source:** none.

---

## 9. Feature status

| Feature | Built | Tested | Notes |
|---|---|---|---|
| Email OTP sign-up/sign-in, optional password | yes | yes (unit + integration) | |
| Google sign-in (PKCE, state, nonce) | yes (commit 71ccabd) | integration tests with a mocked provider; **real Google round trip not done** | Off when GOOGLE_CLIENT_ID unset. Consent screen not published; HANDOFF asks to rotate the client secret. |
| Brevo SMTP | transport built (generic SMTP via nodemailer) | **not tested against Brevo**; local mail goes to Mailpit | SPF/DKIM/DMARC not set up; HANDOFF asks to rotate the Brevo key |
| Admin console | yes (Phase 9) | integration tests (`dashboard-admin.test.ts`) | Admin flag set by SQL only; TOTP per session (no QR code) |
| Vendor dashboard | yes (Phase 9) | integration tests | |
| Payments, test mode | yes: Razorpay provider, orders, signature verify, webhooks, refunds, reconcile | integration tests with the fake provider; **no real Checkout payment, no webhook through a tunnel** | Local PAYMENT_MODE=`test` with a test-kind key; RAZORPAY_WEBHOOK_SECRET missing; live refused in this build |
| Tick / nightly workflows | yes (`tick.yml` every 10 min, `nightly.yml` 21:30 UTC) | jobs tested in-process; **workflows never run** (repo never pushed beyond `main`'s first commit) | Off until repo variable `JOBS_ENABLED=true` plus secrets `API_URL`, `TICK_SECRET` |
| CI workflow | yes (`ci.yml`: audit, gitleaks, typecheck, lint, migrate, test, build) | never run on GitHub | |
| Backup workflow | uncommitted (phase-11 worktree) | no | |
| Localhost sign-off (Phase 10 gate) | script written | **never run** | `docs/LOCALHOST_SIGNOFF.md` missing |
| Not built | – | – | Contract PDF (CT-04), customer reschedule (BK-09), `customers` table, `.ics` attachments, TOTP QR, payout/KYC settings |

---

## 10. Versions in use (local machine)

| Tool | Version |
|---|---|
| Node | v22.16.0 |
| pnpm | 10.13.1 (matches `packageManager`) |
| PostgreSQL | 16.15 (`postgres:16-alpine` container, `x86_64-pc-linux-musl`) |
| Mailpit | `axllent/mailpit:v1.21` |
| Next.js / React | `next ^15.3.1`, `react ^19.1.0` (ranges from package.json) |
| Express | `^5.3.0` |
| TypeScript | `^5.8.3` |
| Target hosts | Vercel (web), Render free + Docker (API), Neon Postgres 16 (per SPEC 16 and AGENTS.md) |
