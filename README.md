# Bayana

Bayana lets a wedding-services vendor expose a booking link, collect a Razorpay advance, and prevent double-confirmed dates.

## Local setup

1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env` and replace every placeholder.
3. Run `npm install`, `npm run db:migrate`, and `npm run db:seed`.
4. Run `npm run dev:server` and, separately, `npm run dev:client`.

Run `npm test` for the server test suite. Set `TEST_DATABASE_URL` to run the PostgreSQL concurrency integration test; run it repeatedly with `1..10 | % { npm test }` before release. API documentation is at `http://localhost:4000/api/docs` in development. Required environment variables are listed in `.env.example`; the server validates all of them at startup.

## Date-concurrency guarantee

User-facing availability checks are only advisory. The database migration defines a PostgreSQL partial unique index on `(vendor_id, event_date)` for confirmed bookings. Confirmation happens in a transaction and catches the resulting conflict, so concurrent requests cannot produce two confirmed clients for one vendor/date.

See [architecture notes](docs/ARCHITECTURE.md), the detailed [business-logic guide](docs/LOGIC.md), and [OpenAPI spec](docs/swagger.yaml).

## Product routes

The public booking experience is served at `/`; use `/vendor` for the vendor dashboard shell. Configure `VITE_PUBLIC_SLUG` for the public vendor link. Dashboard API access requires the authenticated vendor ID and access token; a production deployment should source these through the login flow rather than Vite environment variables.
