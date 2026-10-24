# Bayana: Claude Code phase pack

Use with `AGENTS.md`, `CLAUDE.md` and `docs/SPEC.md` (the specification docx saved as markdown or kept alongside). One phase per session. Start every session in **plan mode**, approve the plan, then let it code. Commit on a branch `phase-<n>-<name>` at the end.

**Order logic:** everything works on localhost first (phases 0 to 10). Every phase is deploy-ready by rule (no hardcoded localhost, all config from env, no local-disk storage), so phases 11 and 12 are only configuration.

| Phase | Name | You can demo at the end |
|---|---|---|
| 0 | Audit and keep/rewrite decision | A PASS/FAIL list of the old code |
| 1 | Foundation | Clean install, migrate, test on a fresh clone |
| 2 | Design system and app shell (UI reset) | A new look across every placeholder page |
| 3 | Auth | Sign up, log out, sign in by password and by OTP |
| 4 | Vendor setup | Onboarding, services, availability, publish |
| 5 | Booking engine | Race test with exactly one winner |
| 6 | Public page and booking flow | A customer books a slot (payments off) |
| 7 | Payments | Test-mode payment confirms the booking |
| 8 | Emails and background jobs | Emails survive an SMTP outage; tick endpoint works |
| 9 | Vendor dashboard and admin | You run the whole product without touching SQL |
| 10 | Hardening and localhost sign-off | Full localhost checklist passes |
| 11 | Deploy preparation | Docker build and a staging config rehearsal |
| 12 | Go online (Neon, Render, Vercel) | Staging live on your domain |

---

## Paste at the start of every session

```
Read AGENTS.md and CLAUDE.md. Today's task is PHASE <n> below.
Use plan mode: give me a plan of 10 lines or fewer and wait for approval.
Rules for this session:
- Work on branch phase-<n>-<name>. Do only this phase. Stop at its gate.
- Never edit applied migrations (001 to 003). New migrations get the next free number.
- Never drop or reset a database. Tests run only against a database whose name ends in _test.
- Never enable PAYMENT_MODE=live. Never print or commit secrets.
- Deploy-ready rule: no hardcoded localhost URLs, all config from validated env vars, no files written to local disk for user data.
- Run pnpm.cmd typecheck, lint, test, build at the end and report exit codes.
- Append a 15-line-or-shorter entry to docs/PROGRESS.md.
- Final report: per item PASS, FAIL, BLOCKED or NOT TESTED, with file:line for defects.
```

---

## Phase 0: Audit and keep/rewrite decision

**Goal:** know exactly what you have. No feature work.

```
PHASE 0. Audit the existing repository against docs/SPEC.md sections 4, 8, 10, 11 and 12.
1. Run git status, list apps/packages, read package.json files, list migrations 001 to 003 and summarise the schema.
2. Reproduce the sign-in bug: a vendor who verified their email earlier cannot sign in again. Find the root cause (file:line), not a guess. You may write throwaway scripts outside the repo. Exact error text goes in the report.
3. For each requirement group (AU, VN, SV, AV, BK, PY, CT, NT) mark PASS, FAIL, PARTIAL or NOT BUILT, with evidence.
4. Check these specifically: is there a DB-level overlap guard on bookings; is booking status changed in more than one place; are money values integers in paise; are sessions and OTPs stored hashed; are secrets or localhost URLs hardcoded; does anything write to local disk.
5. Write docs/AUDIT.md with the table, then a recommendation per area: KEEP, REFACTOR or REWRITE, and the reason in one line.
Do not change any source file.
```

**Gate:** `docs/AUDIT.md` exists and the sign-in bug has a root cause.
**Your decision after this:** rewrite any area marked REWRITE in its own phase below. If more than about 60% is REWRITE, start a fresh repo and copy only what passed.

---

## Phase 1: Foundation

**Goal:** a boring, solid base. Everything later sits on it.

```
PHASE 1 Foundation. Spec sections 6, 7, 8.5, 16.2, 18.
- Config: one Zod-validated env module per app; process exits with a clear message on missing or invalid vars. Provide .env.example listing names only (Appendix A of the spec).
- API: Express with request id, Pino logger with redaction (cookie, authorization, password, otp, token, secret), central error handler using the one error shape, helmet, CORS allowlist from WEB_ORIGINS, /health and /ready (ready checks DB).
- DB: pg pool helper, transaction helper, migration runner with schema_migrations and checksums (fail if an applied file changed), separate DATABASE_URL (pooled) and DATABASE_URL_DIRECT (migrations). Test DB guard: refuse to run unless the name ends in _test.
- Docker: compose with Postgres 16, init script that creates bayana_dev and bayana_test. Add a Mailpit container for local email.
- Windows: all scripts must run in PowerShell (use cross-env or node scripts, call pnpm.cmd in docs).
- CI skeleton: GitHub Actions running install, typecheck, lint, test, build against a Postgres service.
- Add a Dockerfile for the API (multi-stage, runs as non-root). Do not deploy it.
- Tests: config validation, error handler shape, migration runner checksum failure, test DB guard.
```

**Gate:** on a fresh clone, `pnpm.cmd install`, `db:migrate`, `test` and `build` all pass.

---

## Phase 2: Design system and app shell (the UI reset)

**Goal:** replace the ugly look once, properly, so every later screen inherits it.

```
PHASE 2 Design system. Spec section 5 and 14. This phase changes ONLY the look and layout, not business logic.
Design direction: calm, trustworthy, modern SaaS for Indian service professionals. Not generic.
- Tokens (Tailwind theme + CSS variables): 
  Colour: background #FAFAF7 (warm off-white), surface #FFFFFF, ink #14181F, muted text #5B6472, border #E6E8EC,
  primary deep indigo #3730A3 (hover #312E81), accent warm amber #D97706 used sparingly for highlights,
  success #15803D, warning #B45309, danger #B91C1C. Full dark mode via CSS variables.
  Type: Inter (or Geist) for UI; a refined serif (for example Fraunces) only for marketing headlines. Scale 12/14/16/18/24/32/48, line-height 1.5 body.
  Spacing 4-pt grid, radius 10px for cards and 8px for inputs, soft shadows (no heavy borders), 44px minimum touch targets.
- Components (shadcn/ui based, in apps/web/components/ui): Button (4 variants, loading state), Input, Select, Textarea, Checkbox, Switch, Dialog, Sheet, Toast, Tabs, Badge (status colours for held/pending/confirmed/completed/cancelled/expired), Card, Table, Skeleton, EmptyState, Stepper, DatePicker, Money display (paise to INR), Avatar.
- Layouts: marketing layout (header, footer), auth layout (centered card), vendor dashboard layout (sidebar on desktop, bottom nav or sheet on mobile), public booking layout (minimal, no distraction, vendor name and a trust footer).
- Page skeletons for every route in spec 5.2 and 5.3 with realistic placeholder content, loading skeletons and empty states.
- Build a /design page (development only) showing every component and state.
- Accessibility: visible focus rings, labels, contrast AA, keyboard navigation, reduced-motion support.
- Mobile first: verify every page at 375px.
- Add Playwright screenshot tests for /design and three key pages at 375px and 1280px.
```

**Gate:** you open the app and every page looks like one product. Send me screenshots if you want a design critique.

---

## Phase 3: Auth

**Goal:** fix the sign-in problem for good. Requirements AU-01 to AU-09. Spec section 12.

```
PHASE 3 Auth. If docs/AUDIT.md says REWRITE, rewrite cleanly; otherwise refactor to match.
- Migration: users (email_normalized unique), sessions (token_hash), otp_codes (code_hmac, purpose, attempts, consumed_at, last_sent_at). Next free migration number.
- OTP: crypto.randomInt, HMAC-SHA256 with OTP_PEPPER bound to email and purpose, 10 minute expiry, 5 attempts counted atomically, single use, 60 s resend cooldown, per-email and per-IP caps.
- Flows: vendor signup = OTP + password together (account exists only after both); login by password OR OTP; password reset by OTP revoking all sessions; logout; session list and revoke.
- Argon2id (bcrypt cost 12 only if argon2 will not install on Windows; tell me if you fall back).
- No account enumeration: same status, body and similar timing for known and unknown emails (hash a dummy when the user is missing).
- Cookies: httpOnly, SameSite=Lax, Secure in production, Domain from SESSION_COOKIE_DOMAIN (empty locally). Rotate token on login and password change.
- Rate limits on every auth route.
- UI (Phase 2 components): /signup (two steps), /login (tabs: password | email code), /forgot, with inline validation and human error messages.
- Tests: every AU acceptance test in spec 4.1, including: a vendor who signed up earlier can ALWAYS sign in again by password and by OTP; OTP reuse, wrong purpose, locked after 5 attempts; enumeration uniformity.
```

**Gate:** the original sign-in bug cannot happen, proven by tests.

---

## Phase 4: Vendor setup

**Requirements:** VN, SV, AV-01 to AV-03, CT-01. Spec sections 4.2, 4.3, 9.

```
PHASE 4 Vendor setup.
- Migrations: vendors, services (price_paise, advance rule, buffers, terms_template, cancellation_tiers), availability_rules, availability_overrides.
- Slug rules and reserved words; publish and unpublish; unpublished and unknown slugs return the identical 404.
- Services CRUD with Zod schemas in @bayana/shared. Advance: percent or fixed, round half up in integer math, never above price. Cancellation tiers validated (ordered, non-overlapping). Terms template with a safe variable list.
- Availability: weekly windows in the vendor timezone (IANA, default Asia/Kolkata), overrides (block or open), minimum notice, maximum window.
- UI: onboarding wizard (profile, first service, availability, publish) with progress, plus dashboard pages for services and availability. A brand-new vendor sees a 3-step checklist, never an empty table.
- Ownership: one shared ownership check; tests that vendor A cannot read or change vendor B's data on every route.
```

**Gate:** a new vendor can sign up, set up and publish a page in under 10 minutes.

---

## Phase 5: Booking engine (the most important phase)

**Requirements:** AV-04, BK-01 to BK-08. Spec sections 8.3, 9, 10.

```
PHASE 5 Booking engine. Backend and tests first; minimal UI.
- Migration: customers, bookings (starts_at, ends_at, block_start, block_end, hold_expires_at, status check, idempotency_key unique per vendor, snapshot columns, access_token_hash), booking_events (append-only: revoke UPDATE and DELETE for the app role), btree_gist exclusion constraint exactly as in spec 8.3.
- Slot engine as a pure function in packages/shared or apps/api/lib with property tests (no overlap, inside windows, sorted, unique) and DST tests including Asia/Kolkata, Europe/London and America/New_York.
- transitionBooking(tx, bookingId, toStatus, actor, reason, meta): the ONLY place that changes status; locks FOR UPDATE, checks the state table in spec section 10, writes booking_events in the same transaction. Add a test that greps the codebase for any other UPDATE bookings SET status.
- Hold creation: per-vendor pg_advisory_xact_lock (transaction level only, Neon pooling safe), expire that vendor's overdue holds first, re-check slot, insert, map SQLSTATE 23P01 to SLOT_TAKEN.
- Idempotency-Key header. Server computes times, price and advance; ignore any client values. Customer access token (32 random bytes, hash stored).
- Concurrency tests: 20 simultaneous holds on one slot via Promise.allSettled gives exactly one success; block-vs-book race the same. Run the race test 10 times in a row.
```

**Gate:** the race test passes 10 times consecutively.

---

## Phase 6: Public page and booking flow

**Requirements:** PB, BK-02, CT-02, CT-03. Spec section 5.

```
PHASE 6 Public experience. This is the screen strangers see, so it must feel trustworthy.
- /<slug>: server-rendered, ISR cached, Open Graph tags, vendor name, services, prices, about, FAQ, strong Book button. Works even when the API is asleep (cached).
- /<slug>/book: stepper (Service, Time, Details, Verify, Review and agree, Pay). Date strip plus time chips; times shown in vendor timezone; 15-minute countdown after hold; clear total, advance and balance; key terms above the fold with full text expandable; acceptance checkbox.
- Contract: render terms with booking values, freeze text and SHA-256 hash, store acceptance evidence (time, IP, user agent, email).
- /b/<id>?t=<token>: customer booking page with status timeline, contract, payment history, cancel with refund preview.
- /waking interstitial: API client times out after 10 s on first call, routes to /waking, polls /health every 3 s, returns the user.
- When PAYMENT_MODE=disabled show an honest message and let the vendor record an offline advance (stub the vendor button for now).
- Human error copy for SLOT_TAKEN, HOLD_EXPIRED, OTP_INVALID. Skeletons, empty and error states everywhere.
- Playwright E2E on mobile viewport: full booking with payments disabled; two browsers racing for one slot.
```

**Gate:** a stranger can book from a phone-sized screen without help.

---

## Phase 7: Payments

**Requirements:** PY-01 to PY-11, CT-04. Spec section 11.

```
PHASE 7 Payments in test mode only.
- PAYMENT_MODE disabled|test|live default disabled; abort startup if key prefix and mode disagree; live also needs LIVE_PAYMENTS_ACK=yes. Never enable live.
- Migrations: payments, refunds, webhook_events (event_id unique).
- POST payment-order (server computes advance from snapshot), payment-verify (HMAC, timing-safe compare, amount and currency checks), confirm booking only inside the same transaction that records the verified payment, via transitionBooking.
- Webhook: raw body signature verification, dedup by x-razorpay-event-id, return 2xx fast, tolerate order.paid and payment.captured in any order, amount or order mismatch gets stored and flagged, not applied.
- Late payment after hold expiry: re-claim slot if free, else auto-refund and email.
- Offline advance recording by the vendor (audited). Refunds from the cancellation policy (same pure function renders preview and issues refund). Receipt PDF. Reconcile job (callable manually for now).
- Tests: bad signature, tampered amount, duplicate webhook, webhook-only confirmation (browser closed), late payment both branches, refund equals preview.
- Document how to test webhooks locally (tunnel or Razorpay CLI) in docs/PAYMENTS_LOCAL.md.
```

**Gate:** confirmation works by browser path and by webhook-only path.

---

## Phase 8: Emails and background jobs

**Requirements:** NT-01 to NT-04. Spec section 15.

```
PHASE 8 Notifications and jobs.
- email_outbox table; business transactions insert rows; sender step with retry and backoff (1, 5, 30, 120 minutes then failed); priority for OTP and payment mail; Brevo SMTP via SMTP_URL, Mailpit locally.
- Templates with plain-text parts: otp, hold_started, booking_confirmed (customer and vendor), booking_cancelled, refund_issued, reminder_24h, payment_review. Clean responsive HTML in the new design.
- POST /internal/jobs/tick protected by TICK_SECRET: expire_holds, send_outbox, send_reminders (reminder_sent_at guard). Nightly: reconcile_payments, cleanup, consistency_check. All idempotent and safe to run late or twice. Record each run in job_runs.
- GitHub Actions workflows tick.yml (every 10 minutes) and nightly.yml, using API_URL and TICK_SECRET secrets. Do not enable them yet.
- Tests: SMTP down does not break booking; two overlapping ticks send one reminder.
```

**Gate:** you can kill the SMTP container, book, restart it, and the emails still arrive.

---

## Phase 9: Vendor dashboard and admin

**Requirements:** BK-09 to BK-13, AD, AU-10. Spec 5.3, 5.4.

```
PHASE 9 Dashboard and admin, fully in the new design system.
- Dashboard home: today and next 7 days, money summary (collected, balance due), to-do list.
- Calendar (month and week): confirmed, held, blocked colour-coded; click a slot to see or block; manual booking through the same slot guard (advisory lock).
- Bookings list with filters and status badges, detail page with timeline, ledger, contract, actions (cancel with reason, complete, reschedule, record offline payment).
- Payments page, customers page, settings (profile, public page, notification preferences, sessions, data export, delete account).
- iCal feed with secret token.
- Admin console under /admin (is_admin plus TOTP): users, vendors, bookings, payments, webhooks, outbox, job runs, health page, audit log; re-verify payment, retry email. Every admin read of user data is audited.
- Table views must become cards on mobile.
```

**Gate:** you can diagnose a stuck booking from the admin screen without SQL.

---

## Phase 10: Hardening and localhost sign-off

**Requirements:** PV, NF. Spec 12, 18.

```
PHASE 10 Hardening.
- Security headers and a strict CSP that allows Razorpay Checkout and Sentry only. Origin check on state-changing requests. Rate limits reviewed on all public routes.
- IDOR test suite: for every route, vendor A cannot read or change vendor B.
- Privacy: data export, deletion with anonymised ledger, consent rows, privacy/terms/refund pages (placeholder text marked "needs lawyer review").
- Accessibility: axe in Playwright on key pages. Performance: Lighthouse on the public page, target LCP under 2.5 s on throttled mobile.
- Log scan test finds no secrets, OTPs or card-like numbers. pnpm audit and secret scan in CI.
- Write the localhost sign-off checklist docs/LOCALHOST_SIGNOFF.md covering spec 16.7 items 1 to 12 as far as they apply locally. Run it and report.
```

**Gate:** localhost sign-off passes. **This is your milestone M0.**

---

## Phase 11: Deploy preparation (still local)

```
PHASE 11 Deploy preparation. Spec section 16.
- Verify the API Docker image builds and runs locally with production env values against the local DB (NODE_ENV=production, TRUST_PROXY=1).
- Create render.yaml (API, health check /health, env var names only) and vercel notes in docs/DEPLOY.md.
- Neon: add a script that checks CREATE EXTENSION btree_gist works and that no session-level locks, SET without LOCAL, or LISTEN/NOTIFY are used anywhere (grep test).
- Cookie rehearsal: run web and API locally under app.localtest.me style hostnames or hosts-file entries to prove same-site cookies work with Domain set (document how).
- Server components forward the cookie to the API; verify with a test.
- backup.yml workflow (pg_dump, encrypt, upload to storage) written but disabled; restore script and docs/RESTORE.md.
- Complete docs/DEPLOY.md: DNS records (web, api, Brevo SPF/DKIM/DMARC merged with Zoho), env var matrix per environment, cost gates from spec 16.8.
```

**Gate:** production-mode build runs locally and `docs/DEPLOY.md` is followable step by step.

---

## Phase 12: Go online (staging first)

Do this with Claude Code open, but you perform the account steps yourself.

```
PHASE 12 Staging deployment. Walk me through each step, one at a time, and wait for me to confirm.
Order: Neon project in an Asia region (pooled and direct URLs) -> run migrations from my laptop with the direct URL -> Render web service for apps/api with env vars -> api-staging custom domain -> Vercel project for apps/web -> staging domain -> DNS records -> GitHub secrets and enable tick.yml -> Razorpay TEST webhook -> run docs/DEPLOY.md staging checklist (spec 16.7, all 12 checks) and report PASS or FAIL for each.
PAYMENT_MODE stays test. Do not enable live. Do not paste secrets in chat; I will enter them in the dashboards.
```

**Gate:** all 12 staging checks pass, including the 20-minute idle wake test.

---

## Before live payments (not a phase)

Complete the cost gates in spec 16.8: commercial hosting terms (Vercel Pro or equivalent), always-on API, paid Neon with restore, a proven restore drill, Brevo plan, Razorpay live KYC and payout decision D1, and a lawyer review of the policies.

## Tips that save you time

- If a session drifts, stop and start a new one. `docs/PROGRESS.md` carries the context.
- If Claude Code says "done", ask for exit codes and the test output.
- Change something big? Add it as a new phase entry here before you build it, so the spec and the code never disagree.
