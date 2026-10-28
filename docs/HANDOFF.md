# Handoff (2026-10-25) — read this first, then docs/PROGRESS.md "Session handoff 3"

**State:** Phase 10 is done on `phase-10-hardening` (`8b647fb`; origin has up to `5db0c48`, and `origin/main` was fast-forwarded to `5db0c48` by another session at the user's request). Branch **`hosting-ready`** (from `8b647fb`, not pushed) carries the Phase 11 deploy prep plus the deploy-safety code fixes (cookie names, database-only migrate config, Neon pool, graceful shutdown, web build, HSTS). Phases follow docs/CLAUDE_CODE_PHASES.md (SPEC 19.2 numbers them differently). Branch `phase-daily-bookings` (from `hosting-ready`, not pushed) adds per-day booking with migration 021, applied to `bayana_test` only; `bayana_dev` has 001–020 (dev backed up before 020 to backups/bayana_dev-pre-020-20261026-102203.dump).

## Decisions not obvious from the code
- **Status changes:** only `transitionBooking` (apps/api/src/booking-transition.ts) writes `bookings.status`, enforced by a grep test (test/unit/status-writes.test.ts). Same-status events (reschedules) use `recordChange`. Double booking is stopped by the vendor lock `pg_advisory_xact_lock` plus the exclusion constraint `bookings_no_overlap`.
- **Per-day booking (migration 021, SPEC 4.3 "Service modes"):** `services.booking_mode` is `hourly` or `daily` (old TIMED -> hourly, FULL_DAY -> daily 1..1 days). Daily bookings store whole local days [start of D, start of D+N) in UTC, plus buffer days, in the same block_start/block_end, so `bookings_no_overlap` guards daily against hourly with no constraint change. Bookings snapshot `booking_mode`, `days_count` and `vendor_timezone`. API responses carry `first_date` (first local date) so the web shows dates without timezone maths. Day status rules: `availability.ts` `dayStatus` / `dailyRange` / `dayCalendar`.
- **Sessions (migration 022, SPEC 4.3 "Sessions"):** an hourly service's `duration_minutes` is one session and `price_paise` the price of one session; `min_blocks`/`max_blocks` (1..12, both 1 by default) allow several sessions in a row. A booking is one continuous range on one local day inside one open span; buffers once around the whole range; total = price x sessions. Snapshot: `blocks_count`, `block_minutes`; `bookings.duration_minutes` is now the whole booked length (equal to the session for one session). Engine: `availability.ts` `slotsForDate` (each slot has `maxBlocks`) and `hourlyRange`. Display helpers: shared `blocks.ts`; one-session text is byte-identical (contract hashes unchanged). Insert triggers fill one session for raw inserts (seeds, fixtures).
- **Public URLs and the domain switch (docs/DOMAIN_SWITCH.md):** web links come only from `NEXT_PUBLIC_SITE_URL` (`apps/web/lib/site.ts`: vendor links, www redirect, indexing rule) and API links from the first `WEB_ORIGINS` entry. Indexing needs `APP_ENV=production` AND `LEGAL_REVIEWED=true` (robots, sitemap, metadata, `X-Robots-Tag`). `APP_ENV=production` on the API runs `productionProblems` (config-schema.ts): https/no localhost, no _dev/_test database, cookie domain covering web and API hosts, real secrets, no live payments. Web `APP_ENV` stays `staging` until business-details.ts is filled (the production build refuses placeholders). `render.yaml` no longer pins `SESSION_COOKIE_NAME`.
- **Append-only evidence:** triggers reject UPDATE/DELETE for every role on `booking_events`, `booking_contracts`, `audit_logs`, `consents` and `ledger_entries`. The ledger allows exactly one update: setting `reason` to `[personal details removed]` (erasure, migration 019).
- **`bayana_app` role:** a NOLOGIN role without rewrite rights. The API still connects as `bayana`; production should connect as a member of `bayana_app` (open).
- **Column renames:** 013 renamed `starts_at_utc`→`starts_at`, `occupied_*`→`block_*`, and the old `starts_at` (time)→`local_start_time`. 015 renamed `payments.raw_event`→`raw` and `webhook_events.provider_event_id`→`event_id`. Never edit an applied migration; add the next number.
- **Payments:** `PAYMENT_MODE` is `disabled|test|live`; live is refused in this build. An `rzp_live_` key aborts startup unless the mode is live. `PAYMENT_PROVIDER=fake` is allowed only with NODE_ENV=test.
  - CONFIRMED requires a verified payment row (offline counts).
  - A late payment re-claims the slot, or goes to EXPIRED_PAID with an automatic full refund.
  - A vendor cancellation refunds 100%. Refund previews and refunds use the same `refundPreview`.
- **Email and jobs:** all email goes through `email_outbox`. Codes, payments and confirmations are priority 0, sent right after commit (`kickUrgent`). Backoff is 1, 5, 30 and 120 minutes, then failed. OTP bodies are blanked once sent.
  - Delivery: `EMAIL_TRANSPORT=smtp` (local Mailpit) or `brevo_api` (HTTPS to Brevo, no SMTP port; `apps/api/src/email-brevo.ts`, needs `BREVO_API_KEY` + `EMAIL_FROM`). Deployed environments should use brevo_api. Its failures throw, so the same outbox backoff applies. It logs only the status and message id. The logger also redacts any field named like api-key.
  - No timers: GitHub Actions call `POST /internal/jobs/tick` (every 10 min) and `/nightly` with `Bearer TICK_SECRET`. Both stay off until the repo variable `JOBS_ENABLED=true`. Every run is in `job_runs`.
- **Auth: Google + email code is BUILT** (branch auth-google-signin). The password is optional. Google links by subject, then by email, never a second user. No Google tokens are stored. The sign-in state is single-use in `oauth_login_states`. Google is off without `GOOGLE_CLIENT_ID`.
- **Admin:** `users.is_admin` is set only by SQL, plus TOTP per session for 12 hours. The TOTP secret is encrypted with a key derived from `SESSION_SECRET`. Rotating `SESSION_SECRET` breaks sessions, booking links, admin TOTP and in-flight Google sign-ins.
- **Deploy safety (hosting-ready):**
  - The session cookie name is per environment (`SESSION_COOKIE_NAME`: bayana_session, staging bayana_staging_session) on the API and in the web server (server-only). The Google state cookie follows it (bayana_google / bayana_staging_google). Changing it signs everyone out.
  - `migrate.ts` and `db:check-neon` load only `NODE_ENV` and the database URL (`db-config.ts`, `loadDatabaseConfig`). Everything else loads the full config.
  - Pool: max 10, idle 10 s, connect 15 s. Idle drops are logged as `database.idle_client_error`; `/ready` retries once. The logger redacts any field named `code`, so database codes are logged as `pgCode`.
  - SIGTERM/SIGINT: stop accepting connections, wait up to 10 s for in-flight requests, end the pool, exit 0 (`shutdown.ts`).
- **CSP:** account pages render per request with a nonce. The cached public page `/[slug]` and static pages keep script `'unsafe-inline'` (cached HTML can't carry a nonce). `style-src 'unsafe-inline'` stays.
- **Performance:** fonts use `display: optional`, CSS is inlined, and public links don't prefetch. The Lighthouse gate uses the measured LCP (median of 3, about 1.4 s); the simulated estimate (about 3.0 s) is printed too.
- **Privacy:** erasure removes names, emails, phones and notes, and keeps money rows. Contracts are kept as legal evidence. Legal pages are drafts that need lawyer review.
- **Legal pages (hosting-ready):** /terms, /vendor-terms, /privacy, /refunds, /shipping, /contact, /about, /pricing read the operator's identity and prices from `apps/web/lib/business-details.ts`. Its `[PLACEHOLDER]` values make a build with `APP_ENV=production` fail until they are filled in. The "needs lawyer review" banner shows until the web setting `LEGAL_REVIEWED=true`.
  - Consent: vendors record account_terms + vendor_terms + privacy_policy at signup; bookings record booking_terms + account_terms + refund_policy + privacy_policy. Bump the version in `POLICY_VERSIONS` whenever a page's text changes.
  - One footer (`components/layout/site-footer.tsx`) on the site, booking and auth layouts. `robots.txt` lets crawlers in only when APP_ENV=production.

## Open bugs and limitations
- **Phase 10 localhost sign-off done** (docs/LOCALHOST_SIGNOFF.md): 11 of 12 PASS locally. Still for staging: Checkout payment, real webhook, real cold start, scheduled tick, mail DNS.
- **Phase 11 deploy prep is on `hosting-ready`** (docs/DEPLOY.md is the deploy runbook). Staging = staging.bayana.in + api.staging.bayana.in, cookie domain `.staging.bayana.in`; Render staging deploys from `hosting-ready`. The worktree `C:devayana-phase11` was left untouched and can be removed once hosting-ready is merged (`git worktree remove`; it has uncommitted files, so check first).
- **Untested:** a real Razorpay Checkout payment and the webhook through a tunnel (`RAZORPAY_WEBHOOK_SECRET` is empty); a real Google round trip; Brevo SMTP; GitHub Actions (never pushed).
- **Test speed:** NODE_ENV=test hashes passwords with the argon2 minimum (`passwordHashOptions` in apps/api/src/auth.ts; unit test password-hashing.test.ts proves production keeps 64 MiB, t=3). `pnpm.cmd test` passed three times in a row. dashboard-admin.test.ts never hashed passwords; its old 5 s timeouts came from running gates alongside dev/build/Playwright. Run gates one at a time.
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
**Current state:** `hosting-ready` is pushed at `2c29a8b` and live on the staging hostnames; Neon staging has migrations up to 022 (backup `backups/neon-staging-pre-020-022-20261027-2213.dump`). Branch **`domain-switch`** (from `hosting-ready`, not pushed) makes the same deployment ready for `https://bayana.in` and `https://api.bayana.in`. The next free migration number is **023**.
**Open items, in order:**
1. Merge `domain-switch` into `hosting-ready` and push (your call), then follow docs/DOMAIN_SWITCH.md: DNS and certificates, Google redirect URI and consent screen, Brevo domain authentication, then the Render and Vercel values, the GitHub `API_URL` secret, and the 12-check smoke test.
2. Back up and migrate `bayana_dev` (021, 022), then the local trials (docs/PROGRESS.md "Per-day booking", "Multi-session booking").
3. Fill `apps/web/lib/business-details.ts`, then web `APP_ENV=production`; lawyer review of the legal pages, then `LEGAL_REVIEWED=true` (your decision; nothing in the repo sets it).
4. Razorpay test setup on the new API host (webhook `https://api.bayana.in/webhooks/razorpay`); live payments stay refused.
5. Still open: runtime role `bayana_app`; per-IP rate limits for server-side calls from Vercel; test:visual on a production build; customer-side reschedule; Vercel Hobby is non-commercial (move before earning).
Never push or merge into `main` without asking.

## Commands (PowerShell, always pnpm.cmd)
- Run: `pnpm.cmd db:up` · `pnpm.cmd dev` (web 3000, API 4000, Mailpit 8025) · `pnpm.cmd run doctor`
- Test: `pnpm.cmd typecheck` · `lint` · `test` · `build` · `test:visual` · `test:e2e` (one at a time, dev stopped; set `$env:DATABASE_URL_TEST` first) · `perf:lighthouse` · `signoff:local`
- Migrate: `pnpm.cmd db:migrate` (dev) · `pnpm.cmd db:migrate:test`
- Backup: `docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/dev.dump bayana_dev` then `docker cp bayana-postgres-1:/tmp/dev.dump backups\bayana_dev-<date>.dump`
- Restore: `docker cp backups\<file>.dump bayana-postgres-1:/tmp/r.dump` then `docker exec bayana-postgres-1 pg_restore -U bayana -d bayana_dev --clean --if-exists --no-owner /tmp/r.dump`
- Jobs: `pnpm.cmd jobs:tick` · `pnpm.cmd jobs:nightly` · `pnpm.cmd payments:reconcile`
- Security: `pnpm.cmd audit --audit-level=high` · the gitleaks command in docs/RUN_LOCAL.md
