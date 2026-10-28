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

## Phase 10 Hardening - localhost sign-off - 2026-10-25 (branch phase-10-hardening) - DONE
- docs/LOCALHOST_SIGNOFF.md: SPEC 16.7 on localhost, 11 of 12 PASS (1-5, 10, 12 live via `pnpm.cmd signoff:local`; 6, 7, 9 by integration test; 8 simulated with Playwright against dev). 11 (mail DNS) NOT APPLICABLE; the Razorpay Checkout part of 4 NOT TESTED.
- Defect fixed: concurrent retries of one gateway refund (refund.processed before its payment) hit refunds_provider_refund_id_key and flagged the event for review. applyProviderRefund now inserts ON CONFLICT DO NOTHING and re-reads FOR UPDATE. Regression test in payments.test.ts (fails without the fix).
- signoff-local.mjs fixed: Mailpit code reuse (OTP_INVALID) and missing phone (PHONE_REQUIRED). Test timing fixed, no assertion weakened: AU-04 timeout 20 s; hardening.test.ts code waits 10 s; settled({ processed }) in payments.test.ts.
- Visual: the design desktop baseline (from 3220420) was a capture taken before hydration (blank avatars). Now the test waits for hydration, screenshot.css hides scrollbars (a 17 px shift), and the baseline is regenerated. vendor.spec.ts services assertion no longer collides with the toast.
- After moving the repo: run `pnpm.cmd install --frozen-lockfile` and delete apps/web/.next (broken links and a stale cache). `git worktree repair` was done for C:\dev\bayana-phase11 (its 17 uncommitted files untouched).
- Never run pnpm dev at the same time as test:e2e/test:visual/build, including from another session: they share apps/web/.next.
- Next: branch hosting-ready from this commit, bring in C:\dev\bayana-phase11, adapt to Google sign-in + Phase 10, test, push only that branch.

## Phase 10 close-out - 2026-10-25 (branch phase-10-hardening, after 5db0c48)
- Test-speed root cause: every password hash in the suite used production argon2id (64 MiB, t=3). NODE_ENV=test now uses m=1024, t=1 (passwordHashOptions, apps/api/src/auth.ts:18), with the unknown-email dummy hash built from the same options. test/unit/password-hashing.test.ts proves production and development keep 64 MiB and t=3.
- AU-04: the 20 s timeout is removed; it compares medians of 11 interleaved runs (ratio 0.5-2) and takes about 0.2 s. dashboard-admin.test.ts never hashed passwords; its old timeouts came from gates running alongside dev/build/Playwright.
- docs/LOCALHOST_SIGNOFF.md: each item now has how to check, the expected result and the evidence.
- Gates (each alone, dev stopped): typecheck 0, lint 0, test 0/0/0 (three runs, 94 unit + 164 integration each), build 0, test:visual 0 (227 passed, 1 skipped), test:e2e 0 (4 + 2), then signoff:local 0 against pnpm dev.
- test:visual is still exposed to next dev hot-swapping layout.css mid-test (seen once as /design losing every sm: rule; visual.spec.ts now waits for hydration and sm: padding, and screenshot.css is back to the original). Real fix, not done: run the visual suite on next build + next start and re-baseline.
- Another session pushed phase-10-hardening and fast-forwarded origin/main to 5db0c48 (adds docs/DEPLOY_REVIEW_BUNDLE.md). gitleaks over 21 commits: no leaks.

<!-- Imported unchanged from the phase-11-deploy-prep worktree (uncommitted there); superseded where the hosting-ready entry below says so. -->
## Phase 11 Deploy preparation - 2026-10-24 (branch phase-11-deploy-prep, worktree C:\dev\bayana-phase11)
- Built in a separate git worktree outside OneDrive, from 40f974c, because a parallel session was editing auth-google-signin in the main folder. Merge by PR; expect a small conflict only in docs/PROGRESS.md and in root and apps/web package.json scripts.
- API image: built, migrated a new local DB bayana_rehearsal (production config refuses _dev/_test names), then ran with NODE_ENV=production and TRUST_PROXY=1. Checked: /health and /ready return 200, X-Forwarded-For is honoured, the cookie is Secure/HttpOnly/Lax with Domain, the container runs as user node, no code or cookie appears in the logs.
- render.yaml (Docker runtime, /health check, names only). docs/DEPLOY.md: rehearsal, Neon, migrations via the image, Render, Vercel (build `pnpm --filter "@bayana/web..." build`), DNS merged with Zoho, variable matrix, staging checklist, cost gates. docs/DEPLOYMENT.md now points there.
- Neon: src/neon-compat.ts + src/neon-check.ts (`pnpm.cmd db:check-neon`, all rolled back) and test/integration/neon-compat.test.ts. Grep test test/unit/pgbouncer-safety.test.ts covers session locks (migrate.ts is the only allowed one, on the direct URL), plain SET, set_config(..., false) and LISTEN/NOTIFY.
- Cookies: apps/web/lib/session-forward.ts + lib/server-api.ts (no page uses serverApi yet). Unit test lib/session-forward.test.mjs (`node --test`; web test:unit is now part of root test:unit). Browser rehearsal against the production image: `pnpm.cmd --filter @bayana/web test:cookies` (needs full Chromium, channel "chromium").
- Backups: .github/workflows/backup.yml is DISABLED (schedule commented out, plus a BACKUPS_ENABLED guard; pg_dump, then age, then R2). scripts/restore.mjs (`pnpm.cmd db:restore`) refuses non-empty targets. docs/RESTORE.md has the setup and drill log. Local drill into bayana_restore_drill passed.
- Local DBs created: bayana_rehearsal, bayana_restore_drill, bayana_phase11_test (all disposable).
- For the auth stream: (1) staging and production share cookie name bayana_session on .bayana.in; needs a per-environment cookie name. (2) migrate.ts needs the full production config (SMTP, TICK_SECRET...), so it can't run with DB URLs alone. (3) Server-side calls from Vercel bucket per-IP rate limits by Vercel's IP.
- Next: Phase 12 (staging go-live), following docs/DEPLOY.md.

## hosting-ready - 2026-10-25 (branch hosting-ready, from phase-10-hardening 8b647fb; not pushed)
- Imported the Phase 11 files unchanged (commit 8a8ee7a): render.yaml, docs/DEPLOY.md, docs/RESTORE.md, the disabled backup workflow, scripts/restore.mjs, the Neon check (`pnpm.cmd db:check-neon`), the PgBouncer grep test, and the web session-forward helpers with the cookie rehearsal. The package.json scripts were merged by hand. All the imported tests pass against Phase 10 code.
- Adapted (commit 611b44e): staging = staging.bayana.in + api.staging.bayana.in with SESSION_COOKIE_DOMAIN=.staging.bayana.in; production stays bayana.in, api.bayana.in, .bayana.in. Google variables and per-environment redirect URIs; WEB_ORIGINS[0] must be the site (the Google callback returns there); checklist 2b. Render staging deploys from hosting-ready. Vercel preview URLs are blocked by the origin check and CORS. DEPLOYMENT.md is a pointer; DEPLOY_REVIEW_BUNDLE.md is git-ignored but still tracked (`git rm --cached docs/DEPLOY_REVIEW_BUNDLE.md` untracks it and keeps the file).
- Supersedes the Phase 11 entry: the cookie-name item is now one-way (staging's cookie no longer reaches production, but production's `.bayana.in` cookie still reaches the staging hosts).
- Gates on hosting-ready: typecheck 0, lint 0, test 0 (100 API unit + 4 web unit + 166 integration), build 0; gitleaks: no leaks (2 new commits, 24 total).
- Code fixes still needed (none made here):
  1. A per-environment session cookie name (API `sessionCookieName`/`cookieOptions` from config; web `SESSION_COOKIE` in lib/session-forward.ts must read the same name).
  2. `migrate.ts` must run with database URLs alone; today production config also demands SMTP, TICK_SECRET, etc.
  3. Server-side API calls from Vercel would share Vercel's IP for per-IP rate limits (only matters once a page uses serverApi; none does yet).
  4. The runtime should connect as a member of the `bayana_app` role (no rewrite rights on evidence tables).
  5. Run test:visual on next build + next start (next dev hot-swaps CSS mid-test).

## hosting-ready code fixes - 2026-10-25 (branch hosting-ready; not pushed)
- 91333d9 untracked docs/DEPLOY_REVIEW_BUNDLE.md (still on disk, git-ignored).
- cf77891 SESSION_COOKIE_NAME (default bayana_session; staging bayana_staging_session) for the API session cookie and the Google state cookie, plus the web server helpers (server-only loadServerEnv). Tests: a token under the other name gets 401; only this environment's cookie is forwarded.
- 9283e76 migrate.ts and db:check-neon load a database-only config (NODE_ENV + database URL). Tests run the real scripts with only those variables; the name checks are kept.
- e4f7e8f pool: max 10, idle 10 s, connect 15 s; pool.on("error") logs and never crashes (a real killed idle client is logged as 57P01); /ready retries once on ECONNRESET, ETIMEDOUT, 57P01 or 08006. DEPLOY.md: URLs need sslmode=require.
- c52db0c graceful shutdown on SIGTERM/SIGINT (10 s grace, pool ended, exit 0); tested in-process, and docker stop on the image exits 0.
- de24189 web build runs `pnpm --filter @bayana/shared build && next build` (verified from a deleted shared/dist); apps/web/Dockerfile removed.
- c96e6ad HSTS without preload (apps/web/security-headers.ts, node:test).
- 4a7b71f production start with missing variables: exit 1, names only (test). API image built: /health 200; /ready 503 against a fake DB host; no .env in the image; runs as node.
- Gates: typecheck 0, lint 0, test 0 (116 API unit + 9 web unit + 175 integration), build 0; gitleaks no leaks (7 new commits, 32 total).
- Still open: bayana_app runtime role; per-IP rate limits for server-side calls from Vercel; test:visual on a production build.

## Brevo HTTPS email transport - 2026-10-25 (branch hosting-ready; not pushed)
- EMAIL_TRANSPORT=brevo_api: POST https://api.brevo.com/v3/smtp/email with the api-key header, built-in fetch (no new dependency), 10 s timeout. The sender is parsed from EMAIL_FROM (per-vendor names kept); htmlContent and textContent are sent; the app sets no reply-to. 2xx = sent; 4xx, 5xx, network error or timeout throw BrevoSendError (status + Brevo's short error code only), so the existing outbox backoff applies. Logs: email.sent with status and messageId only.
- Config: BREVO_API_KEY (min 20) and EMAIL_FROM required with brevo_api; SMTP_URL not needed; names-only errors. The logger now also redacts field names matching api-key. .env.example, render.yaml (sync: false) and the DEPLOY.md matrix plus the email section are updated; staging and production rows now say brevo_api.
- smtp, log and capture are unchanged (same templates, outbox and urgent kick).
- Tests: unit email-brevo.test.ts (success, 4xx, 5xx, network error, timeout, sender parsing, config names only, no key in errors); integration email-brevo-outbox.test.ts (the real outbox with brevo_api and a stubbed fetch: sent row and log; 401 and 503 stay queued with backoff; no key, code or address in the row or log).
- Gates: typecheck 0, lint 0, test 0 (126 API unit + 9 web unit + 178 integration), build 0.
- NOT TESTED: a real send to Brevo (needs the user's API key and the authenticated domain).

## Legal pages - 2026-10-26 (branch hosting-ready; not pushed)
- Done: lib/business-details.ts (placeholders; production build refuses them), server-only web settings APP_ENV and LEGAL_REVIEWED, full drafts of /terms /vendor-terms /privacy /refunds /shipping /contact /about /pricing, one footer on the site, booking and auth layouts, sitemap.xml and robots.txt (production only), docs/sample-invoice.pdf (`pnpm.cmd docs:sample-invoice`).
- Consent: POLICY_VERSIONS adds refund_policy and vendor_terms (account_terms and privacy_policy are now 2026-10-26-draft). Migration 020 widens the consent kinds (dev backed up first). Signup records terms + vendor agreement + privacy; booking records booking terms + platform terms + refund policy + privacy.
- Tests: business-details node:test; consent integration tests; e2e/legal.spec.ts plus layout and axe checks on the new routes. Home and login baselines regenerated (footer). startup-env test moved to integration (it timed out among the parallel unit files). Gates: typecheck 0, lint 0, test 0 twice (124 API unit + 14 web unit + 180 integration), build 0; an APP_ENV=production build is refused (exit 1, field names only).
- Commit note: 5cfae3a also carries the deletion of components/preview/legal-page.tsx (it was already staged), so 5cfae3a..780e350 do not build on their own; c8f4914 and later do.
- For the lawyer (and the CA where tax): payment model wording ("limited agent of the vendor" when collected through Bayana) against RBI payment-aggregator rules and Razorpay's marketplace terms; GST TCS (s.52) and income-tax 194-O if Bayana collects; Consumer Protection (E-Commerce) Rules 2020 duties (seller details on listings, grievance timelines) versus the IT Intermediary Rules 2021 (24 h / 15 days) since the pages promise 48 h / 30 days; the liability cap (INR 5,000 or 12 months' fees) and exclusive New Delhi courts against consumers; DPDP Rules notice format, the 8-year retention statement, cross-border wording, minors (guardian consent), breach timelines (Board, CERT-In 6 h); unilateral change clauses and notice periods (15/30 days); chargeback recovery from vendors under vendor-direct payouts; the prohibited-services list; whether Sentry (if enabled), Zoho (support mailbox) and Cloudflare (DNS) must be named as processors.
- Product gaps the pages describe as current: Free-plan limits (1 service, 5 online bookings a month) and platform-fee deduction are not enforced in code; Bayana's own GST tax invoice for fees is not built (receipts are vendor payment receipts and print "INR", not the rupee sign); vendor pages may need the vendor's address and contact shown (E-Commerce Rules).

## Per-day booking - 2026-10-26 (branch phase-daily-bookings, from hosting-ready; not pushed)
- Migration 021_daily_booking.sql: services.booking_mode TIMED/FULL_DAY -> hourly/daily (default hourly), min_days/max_days/buffer_days, minute fields nullable, CHECK services_mode_fields; bookings.booking_mode (default hourly), days_count, vendor_timezone (backfilled, NOT NULL, filled by trigger when omitted), CHECK bookings_mode_days; FULL_DAY-shaped old bookings marked daily. No constraint change needed for overlaps: bookings_no_overlap already compares block ranges per vendor. Applied to bayana_test only.
- Shared: days.ts (local-day maths: startOfLocalDay handles DST at midnight, dayRangeLabel, dailyTotalPaise); service schema is a Zod discriminated union with plain messages. API: daily engine in availability.ts, GET /v1/vendors/:slug/availability/days (no-store), holds take {date, days} for daily services (stored mode decides), manual booking and reschedule handle daily, emails/contract/receipt show dates, iCal all-day events with exclusive DTEND.
- Web: service form "How do you charge?" (RadioCards, new in components/ui/field.tsx) with live price line; public cards and booking flow (DayStep: month calendar, legend, day count limited to free days, summary); dates instead of times in booking page, my bookings, dashboard, calendar (every covered day), admin; hours: open/closed per weekday for per-day-only vendors (onboarding and dashboard).
- Chosen differently: kept the existing booking_mode column (renamed its values) instead of adding a second one; hourly prices are per session, so cards say "90 min" not "per hour"; buffer days are per booking (a buffer-1 booking needs a free day each side, like hourly buffers); daily bookings use the snapshot timezone for dates, hourly displays still use the vendor's current timezone.
- Tests: integration daily-booking.test.ts (38: migration, validation, exact ranges, adjacency, constraint fires (23P01) for daily-daily and daily-hourly, closed/blocked/time-off days, month and year end, New York DST 25 h and 23 h days, concurrency x5, expiry, idempotency, integer money, client overrides refused, public days endpoint and 404s, contract/email/iCal/manual/reschedule); unit availability test updated; web node:test (day picker rules, labels, preview); Playwright e2e/daily.spec.ts at 375 and 1280. The test file drains its queued hold emails so later files' sign-in codes are not delayed (that caused a google.test failure once).
- Gates: typecheck 0, lint 0, test 0 twice (124 API unit + 20 web unit + 218 integration), build 0; test:visual in the commit report.
- Left: bayana_dev and Neon need migration 021 (back up first); daily bookings cannot be partial days or overnight spans; customer-side reschedule still not built.

## Session save - 2026-10-26 (before compacting)
- Per-day booking is DONE on branch phase-daily-bookings, commit 0a2897b (not pushed, not merged). Migration 021 applied to bayana_test only; NOT applied to bayana_dev or Neon. Next free migration number: 022.
- Facts: services.booking_mode is 'hourly' | 'daily' (renamed from TIMED | FULL_DAY); an hourly price is per session of duration_minutes, not per hour; daily bookings occupy whole local days in the existing starts_at/ends_at columns and the existing overlap constraint covers them; buffers apply per booking.
- Next phase (not started): multi-block hourly booking (several consecutive sessions in one booking; min_blocks and max_blocks on the service).
- Open: back up and migrate bayana_dev, then the 5-step local trial of a daily service; merge phase-daily-bookings into hosting-ready (user's call); Neon backup branch, then staging deploy of all migrations together (migrations, then API, then web). Google sign-in works on staging; OTP email via the Brevo API and the Razorpay test setup are pending on staging; legal pages need lawyer review before Razorpay live.

## Multi-session booking - 2026-10-26 (branch phase-multi-block, from phase-daily-bookings; not pushed)
- Migration 022_multi_block.sql: services.min_blocks/max_blocks (hourly 1..12, longest booking within 24 h, daily NULL; CHECK services_blocks), bookings.blocks_count/block_minutes (hourly 1..12, daily NULL; CHECK bookings_blocks), insert triggers filling one session. Backfill: every hourly service 1/1, every hourly booking 1 session; no price or time column touched (replay test). No constraint change for overlaps. Applied to bayana_test only.
- Shared blocks.ts (MAX_BLOCKS, sessionTotalPaise, durationLabel, sessionRangeLabel); schemas take min_blocks/max_blocks (hourly) and blocks (hold, manual booking). API: engine counts consecutive sessions per start inside one open span with buffers once (slots carry maxBlocks; endpoint no-store with min/max), hourlyRange for holds, total = price x sessions; manual bookings take blocks and refuse past midnight; emails, contract, receipt, booking views show the range. Web: form "Per session" with session length, min/max sessions and a live line; booking flow "How long?" (RadioCards) limited to what is free, hidden when only one length; range summary; cards say "per 1 hour session"; lists, calendar, admin, manual dialog.
- Root-cause fix found by the full run: the urgent email kick sent only the 10 oldest urgent emails, so a sign-in code could wait for the next tick behind a backlog (google.test "no code"). It now sends batches until a batch is not full (at most 5); test in notifications.test.ts fails without the fix.
- Chosen differently: no block_minutes/price_per_block columns on services (duration_minutes and price_paise are the block, per the phase context); the hourly mode radio is renamed "Per session" (two daily.spec selectors updated); API schema messages that say "per hour" kept so existing tests pass unchanged; bookings.duration_minutes stores the whole length; customers see the shared SLOT_TAKEN sentence when a range was just taken.
- Tests: integration multi-block.test.ts (36), web node:test sessions.test.mjs and service-label.test.mjs additions, Playwright e2e/sessions.spec.ts at 375 and 1280. Gates: typecheck 0, lint 0, test 0 (124 API unit + 28 web unit + 255 integration), build 0.
- Local trial (after backup and db:migrate): 1. edit a service: Per session, 60 min, min 1, max 4, price 1500, advance 30% (line shows 3 sessions = Rs 4,500, advance Rs 1,350); 2. open the public page: "per 1 hour session", "1 to 4 sessions"; 3. book: pick a start, How long? 3 sessions, summary shows the range; 4. confirm the booking page, email (Mailpit) and dashboard show start to end; 5. try a start an hour before closing: only 1 session is offered.
- Left: bayana_dev and Neon need 021 and 022 (back up first); sessions on different days are separate bookings by design; no multi-session discount.

## Domain switch preparation - 2026-10-27 (branch domain-switch, from hosting-ready at 2c29a8b; not pushed)
- Staging deploy done earlier today: Neon backup (109 KB, pg_restore --list OK), migrations 020-022 applied to Neon staging, hosting-ready pushed 8b65162..2c29a8b, /ready /health 200, Google on.
- Web: apps/web/lib/site.ts (vendorUrl, vendorLinkLabel, siteHost, indexingAllowed, wwwRedirects, productionWebProblems). Dashboard, onboarding, home and about pages no longer hard-code bayana.in; Copy link uses SITE_URL instead of location.origin (would have copied www or a preview host). www.<apex> 308 to the apex in next.config. Indexing only with APP_ENV=production AND LEGAL_REVIEWED=true: robots (names the sitemap only then), root metadata noindex, legal pages (were index:true even on staging), X-Robots-Tag header.
- API: productionProblems in config-schema.ts for APP_ENV=production (NODE_ENV production, https and no localhost origins and Google redirect, no _dev/_test database, cookie domain required and covering web and API hosts, secrets present and not placeholders, PAYMENT_MODE=live refused). Staging and local values unchanged (tests).
- render.yaml: SESSION_COOKIE_NAME no longer pinned to bayana_staging_session (sync: false; empty = bayana_session); staging comments replaced. env examples reworded. Service name bayana-api-staging kept on purpose (renaming creates a second service).
- Test fix: the outbox backlog test read the queue once right after the code arrived; rows in one batch are sent in no fixed order, so it now waits (until) for the backlog to drain. Seen once in a full run.
- docs/DOMAIN_SWITCH.md: before/after values (Render, Vercel, GitHub, Razorpay), DNS (DNS only, Zoho untouched), Google, Brevo (DKIM, one merged SPF, DMARC), order with rollback, 12-check smoke test. DEPLOY.md points to it.
- Gates: typecheck 0, lint 0, test 0 (139 API unit + 39 web unit + 255 integration), build 0.
