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
- **Phase 10 localhost sign-off done** (docs/LOCALHOST_SIGNOFF.md): 11 of 12 PASS locally. Still for staging: Checkout payment, real webhook, real cold start, scheduled tick, mail DNS.
- **Phase 11 deploy prep is uncommitted** in the worktree `C:\dev\bayana-phase11` (based on Phase 9; render.yaml, docs/DEPLOY.md, RESTORE.md, Neon compatibility, a backup workflow). Agreed plan: bring it onto a new branch `hosting-ready` from phase-10. Moving this repo breaks that worktree's link; run `git worktree repair`.
- **Untested:** a real Razorpay Checkout payment and the webhook through a tunnel (`RAZORPAY_WEBHOOK_SECRET` is empty); a real Google round trip; Brevo SMTP; GitHub Actions (never pushed).
- **Flaky under machine load:** the 5-second timeouts in apps/api/test/integration/dashboard-admin.test.ts (passed in this session's runs). The AU-04 timeout and the hardening.test.ts code waits were raised in Phase 10.
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
