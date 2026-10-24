# Bayana

Bayana is an advance-booking platform for independent service providers. A vendor publishes a page at `bayana.in/<slug>`; a customer picks a service and time, verifies their email, accepts the terms and pays an advance; both sides see the booking and payment state. The full specification is in `docs/SPEC.md`, and current defects are in `docs/AUDIT.md`.

## Run locally (Windows / PowerShell)

You need Node 22, pnpm 10 (`corepack enable`), Git and Docker Desktop. Keep the repository outside OneDrive (for example `C:\dev\bayana`); synced folders cause EPERM/EBUSY errors and slow builds.

1. Start PostgreSQL 16 and Mailpit. A fresh volume creates `bayana_dev` and `bayana_test` automatically through `docker/postgres/init`:

   ```powershell
   pnpm.cmd db:up
   ```

2. Create the environment files and fill in the values (`.env.example` lists names only; see SPEC Appendix A). Never commit them.

   ```powershell
   Copy-Item .env.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

   Locally: `DATABASE_URL` points at `bayana_dev` and `DATABASE_URL_TEST` at `bayana_test`, both on port 5433. `WEB_ORIGINS` and `NEXT_PUBLIC_SITE_URL` are `http://localhost:3000`, and `NEXT_PUBLIC_API_URL` is `http://localhost:4000`. Set `SMTP_URL` to `smtp://localhost:1025` (Mailpit) and `PAYMENT_MODE` to `disabled`.

3. Install, create any missing databases, migrate and seed (the seed runs only when `NODE_ENV=development`):

   ```powershell
   pnpm.cmd install
   pnpm.cmd db:create
   pnpm.cmd db:migrate
   pnpm.cmd seed:dev
   ```

4. Run the web app (port 3000) and the API (port 4000) together with `pnpm.cmd dev`. `http://localhost:4000/ready` checks the database. Mail you send is viewable at `http://localhost:8025`.

Stop with `Ctrl+C`, then `docker compose stop`. Never use `docker compose down -v`, because it deletes the database volume.

## Commands

| Command | What it does |
|---|---|
| `pnpm.cmd db:up` | Starts PostgreSQL and Mailpit |
| `pnpm.cmd db:create` | Creates the databases named by `DATABASE_URL` and `DATABASE_URL_TEST` if missing. Never drops anything |
| `pnpm.cmd db:migrate` | Applies pending migrations over `DATABASE_URL_DIRECT` (falls back to `DATABASE_URL` outside production) |
| `pnpm.cmd db:migrate:test` | Creates and migrates the `_test` database |
| `pnpm.cmd db:migrate:status` | Prints the migration ledger with checksums |
| `pnpm.cmd seed:dev` | Loads development-only sample data |
| `pnpm.cmd typecheck` / `lint` / `test` / `build` | Quality gates. Run all four before every commit; CI runs the same |

Tests refuse to run unless `NODE_ENV=test` and `DATABASE_URL_TEST` names a database ending in `_test`. Migrations are forward-only, and an edited applied migration fails the runner.

## Deployment

Nothing is deployed yet. `apps/api/Dockerfile` builds a non-root production image from the repository root (`docker build -f apps/api/Dockerfile .`). The API must start with `NODE_ENV=production`, and production requires `WEB_ORIGINS`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SESSION_SECRET`, `OTP_PEPPER`, `SMTP_URL` and `EMAIL_FROM`. `PAYMENT_MODE=live` is refused unless `LIVE_PAYMENTS_ACK=yes` is also set in production.
