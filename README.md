# Bayana

Bayana is a Phase-1 SaaS booking and advance-payment platform for photographers in India. A photographer publishes a public page; a client reserves a full-day date by paying an advance; both parties can see the remaining balance.

## Run locally (Windows / PowerShell)

You need Node 22+, pnpm 10+, and Docker Desktop. Node and pnpm are already installed on this machine; Docker Desktop is the missing prerequisite.

1. Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/). Finish setup and wait until the engine says it is running.
2. Open PowerShell in this project folder and create the API environment file:

   ```powershell
   Copy-Item .env.example apps/api/.env
   ```

3. Start PostgreSQL:

   ```powershell
   docker compose up -d
   ```

4. Install dependencies and prepare the local database:

   ```powershell
   pnpm install
   pnpm --filter @bayana/api migrate
   pnpm --filter @bayana/api seed
   ```

5. Start the web app and API together:

   ```powershell
   pnpm dev
   ```

6. Open `http://localhost:3000` for the landing page, `http://localhost:3000/rahul-photography` for the client flow, and `http://localhost:3000/dashboard` for the photographer demo. `http://localhost:4000/health` verifies the API/database connection.

To test locally, create a booking hold and use **Demo: simulate successful payment**. This only works with `PAYMENT_MODE=mock`. Stop everything with `Ctrl+C`, then `docker compose down`.

## Production deployment

Use a managed PostgreSQL 16 service, a persistent/always-on Node API service, and deploy the Next.js application separately. Set `WEB_ORIGIN`, `DATABASE_URL`, `API_ORIGIN`/`NEXT_PUBLIC_API_ORIGIN`, and production secrets. Run `pnpm --filter @bayana/api migrate` exactly once against the production database before releasing the API.

Do **not** use `PAYMENT_MODE=mock` in production. Razorpay order creation, raw-body webhook HMAC verification, refunds, Route transfers, email OTP, authenticated dashboards, rate limiting, background jobs, observability, and legal pages are deliberately documented follow-up work—not safe to claim as implemented.

## Quality commands

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## Commands

Use `pnpm.cmd` from PowerShell. `pnpm.cmd db:up` starts PostgreSQL; `pnpm.cmd db:migrate` applies development migrations; `pnpm.cmd db:migrate:test` creates and migrates the isolated `_test` database; `pnpm.cmd db:migrate:status` prints the migration ledger; and `pnpm.cmd seed:dev` loads the development-only sample. `pnpm.cmd test`, `test:unit`, `test:integration`, `typecheck`, `lint`, and `build` run the matching quality checks.
