# Bayana business-logic guide

This document describes the behavior implemented today. It distinguishes implemented protections from planned or operational work so engineers do not rely on an assumption that is not enforced by code.

## Booking lifecycle and state machine

**What it does:** A booking begins as `pending_payment`; it becomes `confirmed` after a verified, captured Razorpay payment, or `expired` after its payment hold expires. `cancelled` exists in the database state enum but does not yet have an API or service flow.

**Where it lives:** `server/prisma/schema.prisma`, `server/src/constants.js`, `server/src/services/bookingService.js`, `server/src/index.js`.

**Why it's built this way:** A payment hold reserves enough context to create a Razorpay order without treating an unpaid request as a completed booking. Only `confirmed` bookings participate in the database uniqueness guarantee, so abandoned holds cannot permanently consume a date.

**How it works, step by step:**

1. The public booking endpoint creates a booking as `pending_payment`, a `created` payment row, and its initial history entry in one transaction.
2. It sets `expiresAt` to 30 minutes after creation.
3. A verified captured payment transitions the booking to `confirmed`, the payment to `paid`, and creates a contract and history entry in one transaction.
4. The expiry worker transitions an unpaid, expired hold to `expired`, marks its still-created payment `failed`, and records a history entry.

**What happens when it fails / edge cases handled:** An expired hold cannot be confirmed later. A `cancelled` transition is not yet implemented, so no UI or API should claim that customer or vendor cancellation is available. The expiry worker is idempotent: if two workers see the same stale booking, only the transaction that still finds it pending makes the state change.

## Concurrency-safe booking confirmation

**What it does:** It makes it impossible for two bookings for the same vendor and event date to both become `confirmed`.

**Where it lives:** `server/prisma/migrations/20260823000000_initial/migration.sql`, `server/src/services/bookingService.js`, `server/tests/booking.database-concurrency.test.js`.

**Why it's built this way:** The final guard is PostgreSQL's partial unique index on `(vendor_id, event_date)` where status is `confirmed`. An application-level "is the date free?" query is only a user-experience improvement: two requests can both observe a free date before either writes. The database index remains correct across simultaneous requests and multiple API instances. The current implementation does not take an explicit row lock; it relies on the unique index at write time, and converts its `P2002` violation to a clean conflict.

**How it works, step by step:**

1. Booking creation performs an advisory lookup for an existing confirmed booking and returns a friendly conflict early when one exists.
2. Payment confirmation opens a Prisma transaction.
3. It records the payment, creates the contract, and updates the booking to `confirmed` within that transaction.
4. PostgreSQL checks the partial unique index as the status update is written.
5. If another transaction won the same date, Prisma raises `P2002`; the service changes that into a `409 Conflict` response.

**What happens when it fails / edge cases handled:** Exactly one competing confirmation can commit. The losing caller receives “This date was just taken…” instead of an unhandled 500. The database integration test uses two concurrent confirmed inserts and is intentionally enabled only when `TEST_DATABASE_URL` is configured. It must be run against a migrated PostgreSQL database before release; the smaller unit test alone does not prove the database constraint.

## Auto-expiry of unpaid holds

**What it does:** It releases booking holds that have not been paid within 30 minutes.

**Where it lives:** `server/src/services/bookingService.js` (`expireStaleBookings`), `server/src/index.js`.

**Why it's built this way:** A payment order may never complete. Without expiry, the application would accumulate misleading pending records and a vendor could not tell whether a client was still active. Running the job both at startup and every minute minimizes delay without needing a separate scheduler for the initial deployment.

**How it works, step by step:**

1. On API startup, the process immediately calls `expireStaleBookings`.
2. It calls the same function every 60 seconds; the interval is unreferenced so it does not prevent orderly process shutdown.
3. The service finds pending bookings whose `expiresAt` is earlier than the current time.
4. For each candidate it opens a transaction, re-checks that the booking is still pending and stale, changes it to `expired`, marks a still-created payment as `failed`, and appends history.

**What happens when it fails / edge cases handled:** Worker errors are logged and the next minute retries. A delayed worker can leave a pending row visible longer than 30 minutes, but confirmation itself rejects a booking whose hold has expired. In a multi-instance deployment, more than one worker may scan the same bookings; the in-transaction re-check prevents duplicate state history after the first change.

## Contract acceptance and immutable contract generation

**What it does:** It records that the client accepted terms when creating a hold, then freezes the relevant vendor terms, names, event date, and amounts into a `Contract` record when payment confirms the booking.

**Where it lives:** `client/src/main.jsx`, `server/src/services/contractService.js`, `server/src/services/bookingService.js`, `server/prisma/schema.prisma`.

**Why it's built this way:** Vendor terms and prices can change for future work. A confirmed client needs an immutable snapshot of what they accepted, rather than a reference to mutable vendor profile fields. The contract row is created in the same transaction as the confirmed state, so a successful confirmation cannot lack its contract.

**How it works, step by step:**

1. The public page displays the advance, total package amount, cancellation/terms summary, and a full-terms disclosure before enabling acceptance.
2. The client submits `acceptContract: true`; server Zod validation requires this literal value.
3. The pending booking records `contractAcceptedAt`.
4. At confirmation, the service reads the vendor’s current terms and constructs a snapshot with `generateContract`.
5. It inserts that snapshot into `contracts` before committing payment and confirmation.

**What happens when it fails / edge cases handled:** If contract insertion fails, the surrounding transaction rolls back payment and booking confirmation. A second idempotent payment confirmation returns the previously stored contract. Changing vendor terms after confirmation does not rewrite an existing contract, although there is not yet a vendor-facing terms-editing workflow or versioned draft system.

## Razorpay payment and webhook flow

**What it does:** It creates a Razorpay order for the server-calculated advance, opens Razorpay Checkout in the browser, verifies the checkout response, and supports the signed `payment.captured` webhook as an independent confirmation path.

**Where it lives:** `client/index.html`, `client/src/main.jsx`, `client/src/api/bookings.js`, `server/src/routes/bookings.js`, `server/src/services/bookingService.js`, `server/src/lib/config.js`.

**Why it's built this way:** Prices must never come from the browser. Razorpay signatures prove that a checkout response belongs to the order, while fetching the payment server-side confirms that its order, amount, INR currency, and captured status match Bayana’s payment row. The webhook provides a recovery path if the browser closes after payment.

**How it works, step by step:**

1. The server reads advance and total amounts from the vendor row and creates a Razorpay order for only the advance.
2. The client opens Razorpay Checkout using the returned order ID and public key.
3. The checkout handler posts Razorpay payment ID, order ID, and signature to the confirmation endpoint.
4. The server verifies the checkout HMAC, fetches the payment from Razorpay, validates amount/order/currency/captured status, then runs transactional confirmation.
5. Razorpay can instead send `payment.captured` to `/api/v1/payments/razorpay/webhook`.
6. The webhook route validates its raw-body HMAC with `RAZORPAY_WEBHOOK_SECRET`, validates its payload with Zod, and confirms the matching booking.

**What happens when it fails / edge cases handled:** A delayed webhook is safe: confirmation is idempotent, so a paid booking returns the existing contract. If the browser callback is missed but the webhook arrives, the webhook confirms the booking. If both are missed, there is currently no scheduled Razorpay reconciliation job; payment may remain unrecorded until operations investigate it. An invalid or mismatched payment is rejected before confirmation. The client shows a clear recovery message instead of treating the booking as complete.

## Authentication and refresh-token rotation

**What it does:** Vendors authenticate using short-lived access JWTs and longer-lived refresh JWTs stored in httpOnly cookies; refresh tokens are persisted only as hashes and rotated when used.

**Where it lives:** `server/src/services/authService.js`, `server/src/routes/auth.js`, `server/src/middleware/auth.js`, `server/src/lib/config.js`.

**Why it's built this way:** Access tokens are deliberately short-lived (15 minutes) to limit damage if exposed. A refresh token is not placed in browser JavaScript storage, and storing only its SHA-256 hash lets the database revoke a token without retaining the bearer secret itself.

**How it works, step by step:**

1. Signup hashes the supplied password with bcrypt cost 12 and creates the vendor.
2. Login verifies bcrypt, issues a 15-minute access token and 30-day refresh token, stores the refresh-token hash, and sets the raw refresh token as an httpOnly, same-site cookie.
3. Vendor API calls send the access token in `Authorization: Bearer …`.
4. The refresh endpoint verifies the refresh JWT, finds its hash, deletes it, and creates a new token pair in one Prisma transaction.
5. Logout clears the refresh cookie.

**What happens when it fails / edge cases handled:** Invalid, expired, replayed, or revoked refresh tokens return a generic 401. Password hashes are not selected for API responses. Refresh rotation is transactional, so a partial delete/create failure does not leave an authenticated session half-rotated. Logout currently clears the browser cookie but does not delete the server-side refresh-token record; token revocation on logout is a remaining improvement.

## Vendor resource ownership checks

**What it does:** It prevents an authenticated vendor from requesting bookings belonging to another vendor simply by changing a URL ID.

**Where it lives:** `server/src/middleware/auth.js`, `server/src/routes/bookings.js`.

**Why it's built this way:** Authentication proves who sent the token; it does not automatically prove they own a requested resource. Centralizing this comparison in middleware avoids relying on every future route author to remember the same authorization check.

**How it works, step by step:**

1. `authenticate` reads and verifies the bearer access JWT, placing its subject in `req.auth.sub`.
2. Request parameters are first checked by Zod to ensure the vendor ID has the expected CUID shape.
3. `ensureOwnership` compares that vendor ID with `req.auth.sub`.
4. Only then does the booking-list route call the service query filtered by the same vendor ID.

**What happens when it fails / edge cases handled:** Missing, malformed, or expired access tokens return 401. A mismatched vendor ID returns a safe 401 message and never reaches the database query. New vendor-specific routes must use this middleware or an equivalent resource-owner lookup; it does not apply automatically to routes that are added later.

## Rate limiting and request-size protection

**What it does:** It limits repeated authentication and public booking traffic and caps JSON request bodies.

**Where it lives:** `server/src/app.js`.

**Why it's built this way:** Login and signup are brute-force and account-enumeration targets. Public booking creation can otherwise be abused to create a large number of payment holds. A body limit also reduces malformed-payload and memory pressure risk.

**How it works, step by step:**

1. `/api/v1/auth` is limited to 10 requests per 15-minute window per rate-limit key, covering signup, login, refresh, and logout.
2. `/api/v1/public` is limited to 30 requests per 15-minute window, covering public vendor, availability, and booking endpoints.
3. JSON bodies are limited to 32 KB before route validation.
4. A limit breach returns a structured `RATE_LIMITED` response with a retry-oriented sentence.

**What happens when it fails / edge cases handled:** This uses the default `express-rate-limit` store, which is per API instance. A multi-instance production deployment needs a shared store such as Redis for globally consistent limits. The Razorpay webhook route is intentionally outside the public limiter because it is authenticated with its own signature, but infrastructure-level protection should still allow Razorpay’s documented delivery behavior.

## Public availability calendar and vendor dashboard states

**What it does:** It exposes only date availability—not client information—to the public calendar, and the client displays loading, unavailable, empty, payment, and confirmation states instead of blank pages.

**Where it lives:** `server/src/services/bookingService.js`, `server/src/routes/bookings.js`, `client/src/main.jsx`, `client/src/styles.css`.

**Why it's built this way:** Couples need an immediate, understandable view of dates, while client names and booking details remain vendor-private. Pending holds are shown as unavailable while active so clients do not start payment for a date currently being checked out.

**How it works, step by step:**

1. The client loads the public vendor profile, displaying a skeleton while it waits.
2. It requests a selected month’s confirmed bookings, non-expired pending holds, and vendor-blocked dates.
3. The API returns only ISO date and status values.
4. The calendar marks available dates green, active holds amber, confirmed dates rose, and blocked dates grey; past and non-available dates cannot be selected.
5. At `/vendor`, an authenticated configuration can fetch the vendor’s own bookings; a new vendor sees copy explaining how to share their link.

**What happens when it fails / edge cases handled:** A missing public link has a clear unavailable screen. Availability fetch failure displays a human-readable alert; the calendar does not falsely mark the month as fully available. The dashboard shell currently expects an access token and vendor ID supplied by runtime configuration; a complete in-app vendor login/navigation experience is still needed.

## Error handling, validation, and operational logging

**What it does:** It validates endpoint input, turns expected failures into safe API responses, and logs operationally useful events without logging secrets.

**Where it lives:** `server/src/schemas/`, `server/src/middleware/validate.js`, `server/src/middleware/errorHandler.js`, `server/src/lib/logger.js`.

**Why it's built this way:** Validation before database calls gives clients actionable feedback and prevents malformed values from reaching Prisma. A single error handler ensures unexpected exceptions are logged with context but do not expose internals to clients.

**How it works, step by step:**

1. Each route with input applies a strict Zod schema to body, path parameters, or query parameters.
2. Strict schemas reject unexpected fields rather than silently accepting them.
3. `AppError` subclasses carry safe status codes and messages.
4. The central error handler maps Zod failures to 422, unique conflicts to 409, known application errors to their status, and unknown errors to a generic 500.
5. Pino redacts authorization and password/token-like fields before structured logging.

**What happens when it fails / edge cases handled:** Invalid payment signature format is rejected by validation before timing-safe comparison. Database duplicate confirmation becomes a specific conflict rather than a generic error. An unanticipated bug is logged server-side but clients receive no stack trace or database detail.
