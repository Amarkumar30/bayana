# Bayana engineering rules

Use React/Vite, Express, PostgreSQL/Prisma, JWT plus refresh cookies, bcrypt, Razorpay, Zod, Vitest/Supertest, and Pino. Keep money as integer paise. Validate every endpoint, use centralized safe error handling, and never log credentials.

Booking, payment, and booking-status writes must use Prisma transactions. The PostgreSQL partial unique index on confirmed `(vendor_id, event_date)` is the absolute double-booking guard; catch its conflict and return a clean 409. Keep business logic in services, authorize resource ownership, rate-limit authentication and public booking endpoints, and update Swagger, README, architecture notes, changelog, JSDoc, and tests with each feature.
