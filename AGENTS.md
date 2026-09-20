# AGENTS.md

## Project

Bayana is an npm-workspace monorepo for vendor-managed wedding bookings. Its key guarantee is one confirmed booking per vendor/date. Before substantial changes, read [ARCHITECTURE.md](ARCHITECTURE.md), [docs/LOGIC.md](docs/LOGIC.md), and [docs/execution/current-state.md](docs/execution/current-state.md).

## Stack and structure

JavaScript/ES modules; React/Vite/Tailwind client; Express/Zod API; PostgreSQL/Prisma; bcrypt and JWT access/refresh tokens; Razorpay; Pino; Vitest.

- `client/src/main.jsx`: current UI surfaces and local state.
- `client/src/api/`: fetch calls; `client/src/schemas/`: client form validation.
- `server/src/routes/`: HTTP composition; `services/`: business logic; `schemas/`: strict validation; `middleware/`: auth, ownership, validation, errors.
- `server/prisma/schema.prisma` and `migrations/`: persistent-data contract.
- `server/tests/`: concurrency coverage.

## Required rules

- Put business logic in services, not route handlers.
- Validate every API body, params, and query segment with strict Zod schemas.
- Use integer paise; do not accept price/amount authority from the client.
- Preserve Prisma transactions for booking creation, confirmation/payment, and expiry.
- Preserve `one_confirmed_booking_per_vendor_date`; map its `P2002` conflict to a safe 409.
- Require JWT authentication and ownership checks on vendor resources.
- Preserve raw webhook-body handling and signature verification before processing Razorpay events.
- Use `AppError` and centralized safe errors. Never log passwords, tokens, or credentials.
- Keep history append-only and contracts immutable.
- Update Swagger, README, architecture/logic notes, changelog, and relevant tests when changing a feature.

## Commands

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev:server
npm run dev:client
npm test
```

Set `TEST_DATABASE_URL` for the real PostgreSQL concurrency test; it is skipped otherwise. Use `npm --workspace client run build` for a client build check. Copy `.env.example` to `.env`; the server validates required values at startup.

## Change boundaries

Database changes require Prisma schema and migration updates. API changes require route/schema/service review and Swagger updates. Treat `bayana-project-plan.md` as planning context, not proof of implemented functionality. Consult `docs/execution/current-state.md` for current gaps.
