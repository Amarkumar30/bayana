# AGENTS.md — Bayana

Read this before every task. The full product and technical specification is `docs/SPEC.md`; read only the sections your task names. Instructions in the chat prompt override this file. Keep it honest: if something here is wrong for the real repo, say so in your report instead of silently ignoring it.

## 1. Product

Bayana is a universal advance-booking platform for independent service providers (photographers, salons, tutors, consultants, trainers, event planners, repair professionals). A vendor publishes a page at `bayana.in/<slug>`. A customer picks a service and a time, verifies their email, accepts the terms, pays an advance (Razorpay, once configured), and both sides see accurate booking and payment state. Nothing in the core model may be photography-specific.

## 2. Truthfulness

- Work from the real repository and real command output. Earlier reports, chat history and the stack notes below are claims to verify.
- Never invent files, routes, columns, env vars, library APIs or test results. If you cannot run something, report BLOCKED and say exactly why.
- "Implemented" is not "tested". "Compiles" is not "works". Report them separately.
- Fix root causes. No try/catch that hides errors, no skipped or weakened tests, no commented-out checks.

## 3. Stack (verify against package.json files before relying on it)

- pnpm workspace: `apps/web` (Next.js 15), `apps/api` (Express, raw SQL migrations in `apps/api/sql`), shared TypeScript package `@bayana/shared`.
- PostgreSQL 16 in Docker. Email over SMTP (Brevo): `SMTP_URL`, `EMAIL_FROM`. Payments: Razorpay (`PAYMENT_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).
- Windows with PowerShell: call `pnpm.cmd`, not `pnpm`. Package scripts must run on Windows (no bash-only syntax; use `cross-env` or small node scripts).
- Do not add frameworks, ORMs or auth libraries (no NextAuth/Auth.js, no ORM swap) unless the phase requires it and you justify it in one sentence. Prefer what is already installed. Keep raw SQL migrations.
- Next.js 15: `params`, `searchParams`, `cookies()` and `headers()` are async, so await them. Server Components by default; add `'use client'` only where needed. Never put a secret in a `NEXT_PUBLIC_*` variable.
- The repo may live inside OneDrive. If you see EPERM, EBUSY or very slow builds, report that the repo should move to a non-synced folder. Do not hack around it.

## 4. Safety rules (never break)

**Git**
- Start with `git status`. Never discard or overwrite changes you did not make. Work on a branch named `phase-<n>-<short-name>`. Commit at the end of the phase with a clear message. Never force-push or rewrite history. Never commit `.env` files or secrets.

**Database**
- Never drop the database or a schema, never `TRUNCATE` outside the test database, never run `docker compose down -v`, never reset volumes.
- Migrations are forward-only: add a new file with the next free number, never edit an applied migration. Each migration runs in a transaction. Before any destructive change (drop or rename of a column or table), tell the user to back up first and say how.
- Tests run only against a database whose name ends in `_test`. Refuse to run otherwise.
- Seeds are idempotent, development-only, and refuse to run when `NODE_ENV=production`. They never modify non-seed data.

**Secrets**
- Never print, log or commit secret values. `.env.example` lists names only. Check configuration by presence, not value. Logs redact cookies, authorization headers, passwords, OTP codes, tokens and secrets.

**Payments**
- `PAYMENT_MODE` is `disabled | test | live`, default `disabled`. Never enable live payments. Fail startup if key type and mode disagree (for example an `rzp_live_` key while mode is not `live`).

## 5. Engineering rules

- TypeScript strict. No `any`; use `unknown` plus Zod. Validate every request body, query and param with Zod schemas kept in `@bayana/shared` where web and API both need them.
- SQL is parameterized only. Multi-row writes use a transaction. Money is an integer number of paise (`BIGINT`), never a float. Percentages use integer math with one documented rounding rule (round half up) and an advance never exceeds the total.
- Timestamps are `timestamptz` in UTC. Each vendor has an IANA timezone (default `Asia/Kolkata`). Never depend on the server's local timezone. Use a timezone library, not manual offsets.
- One error shape: `{ "error": { "code": "...", "message": "...", "details": {} } }` with correct status codes. A central error handler. No stack traces to clients.
- Structured logging with a request id and redaction. No `console.log` in committed code.
- Do not rename existing routes without need. If you change an interface, update every caller in the same change.

## 6. Invariants (a phase is not done if any is violated or untested)

**Auth**
- One `users` row per email (case-insensitive unique). Vendors sign up with email OTP **and** a password; the account exists only after both. Returning users sign in with password **or** email OTP. Customers booking a service only verify an email OTP (no password).
- OTP: 6 digits from `crypto.randomInt`, stored as HMAC-SHA256 with a server pepper, bound to a purpose (`signup`, `login`, `reset`, `booking_verify`), 10-minute expiry, 5 attempts counted atomically, single-use, resend cooldown.
- Passwords: argon2id (bcrypt cost 12 or higher only if argon2 will not install on Windows), minimum 10 characters, never logged.
- Sessions: random 32-byte token, only its SHA-256 stored, httpOnly cookie, SameSite=Lax, Secure in production, revocable, rotated on login and on password change.
- Auth endpoints never reveal whether an email has an account (same status, same body, similar timing).
- Never trust the client for role, `email_verified`, vendor id, price, advance, availability, booking ownership or payment status.

**Booking**
- The server computes each booking's `starts_at` and `ends_at` from the service duration and buffers in the vendor's timezone.
- A PostgreSQL exclusion constraint (`btree_gist`) forbids overlapping active bookings for one vendor. Expired holds are expired inside the booking transaction before inserting. Idempotency keys are unique.
- Only one function, `transitionBooking`, changes booking status. It enforces the state machine and writes a `booking_events` row in the same transaction.
- Service name, price, duration, advance rule and terms are snapshotted onto the booking when the hold is created.

**Payments**
- Orders are created on the server with amounts from the booking snapshot. Checkout signatures are verified with HMAC and a timing-safe compare. Webhooks are verified on the raw body, deduplicated by event id, and checked against stored amount, currency and order id.
- A booking becomes confirmed only in the same transaction that records a verified payment (or a vendor-recorded offline advance with an audit event). Never show or store fake success. Never handle card data.

**Privacy**
- Only published vendors are public. Unpublished and nonexistent slugs return the same 404. Owner email and phone are never exposed unless the vendor opted in. Booking pages need an unguessable access token or an authenticated owner. IDs in URLs are UUIDs.

## 7. Deploy-ready rules (apply from the first phase)

The app runs on localhost first, then goes to Vercel (web), Render free (API) and Neon (Postgres). Write every phase so that move is configuration only.

- No hardcoded `localhost`, ports or domains in code. URLs come from validated env vars (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `WEB_ORIGINS`, `SESSION_COOKIE_DOMAIN`). Locally the cookie domain is empty; in staging and production it is `.bayana.in`.
- Do not write user data or uploads to the local disk. The Render free plan has no persistent disk.
- Correctness must not depend on timers or a long-running process. The API may sleep or restart. Hold expiry is lazy (inside booking transactions); background work runs from `POST /internal/jobs/tick`, which must be safe to run late or twice.
- Neon pooled connections use PgBouncer in transaction mode: use only `pg_advisory_xact_lock`, never session-level locks, `SET` without `LOCAL`, or `LISTEN/NOTIFY` on the runtime connection. Migrations use `DATABASE_URL_DIRECT`.
- The first request after sleep can take about a minute. The web app must handle it with the `/waking` flow and cached public pages.
- Check `docs/SPEC.md` section 16 before changing anything about environments, env vars or deployment.

## 8. UI and UX rules

- Use only the design system in `apps/web/components/ui` and the tokens defined in Phase 2. No ad-hoc colours, fonts or one-off styles.
- Mobile first: every page must work at 375px wide. Touch targets at least 44px.
- Every screen has loading (skeleton), empty and error states. Errors are human sentences that say what to do next, never raw codes.
- Forms validate inline using the shared Zod schemas. WCAG AA contrast, visible focus, keyboard usable.

## 9. How to work

1. Do only the phase named in the prompt. Stop when its gate is met. Do not start the next phase.
2. Read only the files you need. Do not re-read files you already read this session. Do not dump files in your replies; cite `path:line`.
3. State a plan in 10 lines or fewer, then make the smallest coherent change set. Do not rewrite working files. Do not reformat unrelated code. Avoid lockfile churn and new dependencies.
4. Run focused tests while working. At the end run `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd test`, `pnpm.cmd build` (use the real script names) and report exit codes.
5. Add tests for every invariant a phase touches. A phase without tests for its risky parts is not done.
6. Append a 15-line-or-shorter entry to `docs/PROGRESS.md` (what was done, what is left, anything the next session must know). Create the file if missing. This lets a new session resume cheaply.
7. Update docs only where the phase says so.

## 10. Final report (60 lines or fewer)

Phase and branch. Per item: PASS, FAIL, BLOCKED or NOT TESTED. Then: what you inspected; defects confirmed (file:line, root cause); changes (files); migrations added or applied; commands run with exit codes; manual steps for the user; known limitations; the next phase.
