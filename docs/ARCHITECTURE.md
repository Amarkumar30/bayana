# Architecture

Bayana is a React/Vite client with an Express REST API and PostgreSQL accessed only through Prisma. `Vendor` owns `Booking`; each booking owns at most one `Payment`. Currency is stored as integer paise, avoiding floating-point rounding.

## Booking state machine

`pending_payment` is created with a Razorpay order and expires after 30 minutes. A signed Razorpay `payment.captured` webhook (with server-side payment verification for the checkout callback) transitions it to `confirmed`; it may instead become `cancelled` or `expired`. The expiry worker runs at start and every minute, marks the payment failed when still unpaid, and records the event. A booking never moves from `confirmed` to another state through the public API.

## Integrity and transaction boundaries

Creating the pending booking, payment row, and history event is one transaction. Payment recording, immutable contract creation, booking confirmation, and history recording are a second transaction. PostgreSQL's `one_confirmed_booking_per_vendor_date` partial unique index is the final concurrency guard: it works even if two callbacks reach separate application instances at the same instant. Its constraint violation becomes a typed 409 response. `booking_history` is append-only at both the application and PostgreSQL trigger layers.
