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
