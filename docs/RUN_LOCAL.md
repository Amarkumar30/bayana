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

## Localhost sign-off (Phase 10)

`pnpm.cmd signoff:local` (scripts/signoff-local.mjs) runs SPEC 16.7 checks 1-5, 10 and 12 against the running dev app (`pnpm.cmd dev`) and Mailpit. It creates its own `signoff-...` vendor and customers in bayana_dev. To have it scan the API log as well, save the dev output and point the script at it:

```powershell
pnpm.cmd dev *>&1 | Tee-Object -FilePath $env:TEMP\bayana-dev.log     # in one window
$env:SIGNOFF_LOG="$env:TEMP\bayana-dev.log"; pnpm.cmd signoff:local    # in another
```

Results and evidence for all twelve items are in docs/LOCALHOST_SIGNOFF.md.

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
- **Moving the project folder** (for example to `C:\dev\bayana`): copy `.env`, `apps\api\.env`, `apps\web\.env.local` and `backups\` by hand (they are not in git). Docker Compose names the project after the folder, so a folder named `bayana` keeps using the volume `bayana_postgres_data` (your data). Run `pnpm.cmd db:up` from the new folder; then `git worktree repair` if you use extra worktrees. A move also breaks pnpm's links and the Next cache: run `pnpm.cmd install --frozen-lockfile` and delete `apps\web\.next` (a missing `tsx/cli`, or 500s naming `routes-manifest.json`, mean exactly this).
