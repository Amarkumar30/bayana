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

## Background jobs locally

Nothing runs on a timer. Urgent mail (codes, payments, confirmations) is sent right after each request. Everything else waits for a tick:

```powershell
pnpm.cmd jobs:tick        # expire holds, retry webhooks, queue 24-hour reminders, send the email outbox
pnpm.cmd jobs:nightly     # payment reconcile (test mode only), retention cleanup, consistency checks
pnpm.cmd payments:reconcile [hours]   # report-only comparison with Razorpay
pnpm.cmd payments:smoke   # one real test-mode payment end to end (see docs/PAYMENTS_LOCAL.md)
```

## Checks before a commit

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test             # unit, then integration (migrates bayana_test first)
pnpm.cmd build
pnpm.cmd test:visual      # Playwright against next dev with a mocked API (Windows screenshot baselines)
pnpm.cmd test:e2e         # real API on bayana_test plus Mailpit; runs twice (payments disabled, then FakeProvider)
```

Rules for these runs:
- **One at a time.** `test:visual`, `test:e2e`, `build` and `pnpm.cmd dev` all use `apps/web/.next`. Stop `pnpm.cmd dev` before running them.
- **`DATABASE_URL_TEST` must be set** (it is in apps/api/.env) for `test` and `test:e2e`.

## Notes

- **Avoid `pnpm.cmd seed:dev` for now.** It still writes the legacy availability table, so its sample vendor has no bookable hours. Create a vendor through `/signup` instead.
- **Before any destructive migration,** back up first. Use `pg_dump -f` inside the container plus `docker cp`; PowerShell's `>` corrupts binary dumps:
  ```powershell
  docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/bayana_dev.dump bayana_dev
  docker cp bayana-postgres-1:/tmp/bayana_dev.dump backups\bayana_dev-<date>.dump
  ```
- **If something fails,** `pnpm.cmd run doctor` prints a fix for each failed check.
