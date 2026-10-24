# Bayana

@AGENTS.md

## What this is
Advance-booking SaaS for independent service providers in India. Vendor page at `bayana.in/<slug>`; customer books, accepts terms, pays an advance (Razorpay); both sides see booking and payment state. Full spec: `docs/SPEC.md`. Phase prompts: `docs/CLAUDE_CODE_PHASES.md`.

## Commands (Windows PowerShell, always `pnpm.cmd`)
- `pnpm.cmd dev` runs web (3000) and API (4000)
- `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd test`, `pnpm.cmd build`
- `pnpm.cmd db:migrate`, `pnpm.cmd db:seed` (development only)
- Database: `docker compose up -d db` (Postgres 16; `bayana_dev` and `bayana_test`)
Verify these script names in the package.json files; correct this file if they differ.

## Where things are
- `apps/web` Next.js 15 app. UI components in `apps/web/components/ui`
- `apps/api` Express API. Migrations in `apps/api/sql` (forward-only, next free number)
- `packages/shared` (`@bayana/shared`) Zod schemas, types, error codes, money helpers
- `docs/` SPEC.md, PROGRESS.md, AUDIT.md, DEPLOY.md

## Working agreements
- One phase per session. Plan mode first; the plan is 10 lines or fewer. Stop at the phase gate.
- Only `transitionBooking` changes booking status.
- Money is integer paise. Time is UTC, shown in the vendor's timezone.
- Never enable `PAYMENT_MODE=live`. Never run destructive database commands. Never commit secrets.
- Report real command output and exit codes. "Compiles" is not "works".
- Before finishing: append to `docs/PROGRESS.md`.
