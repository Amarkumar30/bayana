# Bayana

Bayana is an advance-booking platform for independent service providers. A vendor publishes a page at `bayana.in/<slug>`; a customer picks a service and time, verifies their email, accepts the terms and pays an advance; both sides see the booking and payment state. The full specification is in `docs/SPEC.md`, and current defects are in `docs/AUDIT.md`.

## First-time setup (Windows PowerShell, 6 commands)

You need Node 22, pnpm 10 (`corepack enable`), Git and Docker Desktop running. Keep the repository outside OneDrive (for example `C:\dev\bayana`); synced folders cause EPERM/EBUSY errors and slow builds.

```powershell
pnpm.cmd install          # dependencies
pnpm.cmd db:up            # PostgreSQL 16 (port 5433) and Mailpit (SMTP 1025, inbox http://localhost:8025)
pnpm.cmd setup:env        # creates apps/api/.env and apps/web/.env.local if missing; never overwrites; lists anything still to fill in
pnpm.cmd db:create        # creates bayana_dev and bayana_test if they do not exist
pnpm.cmd db:migrate       # lists pending migrations, then applies them (refuses unless the database name ends in _dev)
pnpm.cmd dev              # web on http://localhost:3000, API on http://localhost:4000
```

If anything fails, run `pnpm.cmd run doctor` (with `run`: plain `pnpm doctor` is a built-in pnpm command). It checks Node and pnpm, the env files (by variable name only), the database and its migrations, and the ports, and prints the fix for each failed check. Env errors at startup name the variable, the allowed values and the file to edit.

Back up before migrating a database that holds data you care about (`>` redirection in Windows PowerShell corrupts binary dumps, so copy the file out of the container):

```powershell
docker exec bayana-postgres-1 pg_dump -U bayana -Fc -f /tmp/bayana_dev.dump bayana_dev
docker cp bayana-postgres-1:/tmp/bayana_dev.dump backups\bayana_dev.dump
```

Optional: `pnpm.cmd seed:dev` loads development-only sample data.


Stop with `Ctrl+C`, then `docker compose stop`. Never use `docker compose down -v`, because it deletes the database volume.

## Commands

| Command | What it does |
|---|---|
| `pnpm.cmd db:up` | Starts PostgreSQL and Mailpit |
| `pnpm.cmd setup:env` | Creates missing env files from the examples (never overwrites) and lists variables still needing a value |
| `pnpm.cmd run doctor` | Read-only health check of tools, env files, database, migrations and ports, with a fix per failure |
| `pnpm.cmd db:create` | Creates the databases named by `DATABASE_URL` and `DATABASE_URL_TEST` if missing. Never drops anything |
| `pnpm.cmd db:migrate` | Applies pending migrations over `DATABASE_URL_DIRECT` (falls back to `DATABASE_URL` outside production) |
| `pnpm.cmd db:migrate:test` | Creates and migrates the `_test` database |
| `pnpm.cmd db:migrate:status` | Prints the migration ledger with checksums |
| `pnpm.cmd seed:dev` | Loads development-only sample data |
| `pnpm.cmd typecheck` / `lint` / `test` / `build` | Quality gates. Run all four before every commit; CI runs the same |

Tests refuse to run unless `NODE_ENV=test` and `DATABASE_URL_TEST` names a database ending in `_test`. Migrations are forward-only, and an edited applied migration fails the runner.

## Deployment

Nothing is deployed yet. `apps/api/Dockerfile` builds a non-root production image from the repository root (`docker build -f apps/api/Dockerfile .`). The API must start with `NODE_ENV=production`, and production requires `WEB_ORIGINS`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SESSION_SECRET`, `OTP_PEPPER`, `SMTP_URL` and `EMAIL_FROM`. `PAYMENT_MODE=live` is refused unless `LIVE_PAYMENTS_ACK=yes` is also set in production.
