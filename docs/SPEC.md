**BAYANA**

**Product and Technical Specification**

Advance booking, contracts and payments for independent service providers

Version 1.0 · October 2026

Domain: bayana.in · Owner: Amar Kumar (solo founder)

Build path: localhost → Vercel + Render + Neon → paid hosting when revenue arrives

> **Purpose** This is the single source of truth for what Bayana is, what it must do, how it is built, how it is deployed on free tiers, and in what order it is coded. It is written so that Claude Code can implement it phase by phase. Every requirement has an ID (for example BK-03) so prompts, tests and commits can point at it.

# 0. How to use this document

| **Item**        | **Value**                                                                                                                                              |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Product         | Bayana, a SaaS web application                                                                                                                         |
| Status          | Specification v1.0. A partial codebase already exists (see section 0.2)                                                                                |
| Audience        | The founder, Claude Code (as the implementing agent), and any future engineer or reviewer                                                              |
| Companion files | AGENTS.md (rules for every coding session), CODEX_PHASES.md (earlier phase prompts, mapped to section 19)                                              |
| Facts checked   | Hosting, email and payment limits in section 16 and Appendix F were checked in 2026. Providers change terms often, so re-check before each launch step |

## 0.1 Reading order

- **Founder, first pass:** sections 1 to 3 (what and why), 16 (deployment), 19 (build plan), 22 (decisions you must make).

- **Claude Code, every session:** CLAUDE.md plus the one phase in section 19 you are working on, plus only the sections that phase references.

- **Reviewer or investor:** sections 1, 6, 9, 10, 11, 12 and 21 show the product thinking, the booking-integrity design, the money design, the security model and the honest risks.

## 0.2 Starting point: what already exists

The repository is a pnpm monorepo that already contains a Next.js 15 web app, an Express API, a shared TypeScript package, and raw SQL migrations 001 to 003 applied to a local PostgreSQL 16 in Docker. Email goes through Brevo SMTP, with Zoho Mail as the mailbox for hello@bayana.in. Razorpay is planned but not yet live. The known problems are: a returning vendor who verified earlier cannot sign in again, there is no clean auth model, and the structure is uneven. This specification replaces guesswork with one design. Anything in the repo that contradicts it is treated as a defect to fix, not as a decision to preserve.

## 0.3 Conventions

- **MUST / SHOULD / MAY** follow their usual meaning. MUST items are release blockers.

- **Requirement IDs** use a two-letter area code and a number: AU auth, VN vendor, SV services, AV availability, BK booking, PY payments, CT contract and terms, NT notifications, AD admin, PB public pages, NF non-functional.

- **Priority tags:** P0 is required for the first paid booking, P1 is required for public launch, P2 comes after launch.

- **Money** is always an integer number of paise (1 rupee = 100 paise). **Time** is stored in UTC and shown in the vendor's timezone.

# 1. Product vision and positioning

## 1.1 The problem

Independent service providers in India (photographers, makeup artists, tutors, trainers, salons, consultants, event planners, repair professionals) take bookings over WhatsApp and phone calls. Dates get double-booked, advances are paid by UPI screenshot and then disputed, nobody keeps a written agreement, and the provider spends hours a week confirming, reminding and chasing money. The customer has no proof of what was agreed. Cancellation and refund fights have no rulebook.

## 1.2 The product in one paragraph

Bayana gives each provider a booking page at bayana.in/\<name\>. A customer picks a service and a time, verifies their email, reads and accepts the provider's terms, and pays an advance online. The slot is then locked for them and nobody else can take it. Both sides see the booking, the contract they accepted, and exactly how much has been paid and how much remains. The provider gets a calendar, a list of bookings and a payout record. Bayana is not a marketplace: it does not list providers for strangers to browse. The provider brings their own customers and Bayana makes the booking trustworthy.

## 1.3 Positioning

| **Dimension**   | **Bayana**                                                                 | **Why it matters**                                                             |
|-----------------|----------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Who it serves   | Independent providers with a calendar and an advance to protect            | Narrow enough to build well, wide enough to grow beyond one vertical           |
| Discovery       | None by design. Provider shares a link                                     | Avoids the marketplace cold-start problem and the commission fight             |
| Money model     | Subscription plus a small platform fee on online advances (see section 20) | Provider keeps the customer relationship; Bayana earns when the provider earns |
| Trust mechanism | Slot lock plus accepted terms plus payment record                          | Replaces screenshots and memory with evidence both sides can open              |
| Local fit       | UPI, INR, GST-aware, Indian timezone, WhatsApp-friendly share links        | Global tools handle India poorly                                               |

## 1.4 Personas

| **Persona**                       | **Situation**                                                          | **What they need**                                                   | **What makes them leave**                                   |
|-----------------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------------|
| Riya, wedding photographer, Delhi | 40 bookings a year, 20 to 50 percent advance, books from Instagram DMs | A link in her bio, a locked date, a clear advance record, a contract | Setup longer than 30 minutes, customers confused at payment |
| Karan, personal trainer           | Hourly sessions, packages, frequent reschedules                        | Recurring time slots, buffers, reminders, no-show protection         | No reschedule flow, email-only reminders                    |
| Meera, home tutor                 | Weekly slots, parents pay monthly                                      | Weekly availability, easy cancellation policy                        | Per-booking fees that eat small amounts                     |
| Customer (any)                    | Phones only, wants to book in two minutes                              | No password, clear price, secure payment, confirmation they can keep | Forced signup, hidden fees, unclear refund terms            |
| Founder or support admin          | Solo operator                                                          | See stuck bookings, failed payments and failed emails in one place   | Silent failures                                             |

## 1.5 Product principles

1.  **The slot is sacred.** The database, not application code, must make a double booking impossible.

2.  **Money is never guessed.** Every rupee on screen comes from a stored, verified record. No fake success states.

3.  **Nothing is photography-specific.** A service has a name, a duration, a price, an advance rule and terms. That is all the core knows.

4.  **Provider first, customer frictionless.** Vendors get power; customers verify an email and pay.

5.  **Boring and correct beats clever.** Prefer plain SQL, plain HTTP and few moving parts. One person must be able to run this.

6.  **Everything is explainable.** Every booking state change is recorded with who, when and why.

# 2. Scope and release plan

## 2.1 In scope for v1 (P0 and P1)

- Provider signup, profile, public page, services, weekly availability, date blocks, buffers, timezone.

- Customer booking flow with email OTP, slot hold, terms acceptance, advance payment, confirmation.

- Booking lifecycle: hold, pending, confirmed, completed, cancelled, expired, with a full event log.

- Razorpay payments in test mode first, with verified webhooks; manual offline-advance recording as a fallback.

- Provider dashboard: calendar, bookings, payments, customers, settings.

- Transactional email: OTP, confirmation, reminder, cancellation, receipt.

- Admin console for the founder: users, bookings, payments, jobs, email outbox, health.

- Legal pages, consent records, data export and account deletion.

## 2.2 Explicitly out of scope for v1

- Marketplace search, ratings and discovery pages.

- Native mobile apps (the web app must be fully mobile-responsive and installable as a PWA later).

- Multi-staff calendars, team accounts and resource booking (a provider is one person in v1).

- WhatsApp and SMS sending (planned P2; email first because it is free at this scale).

- Digital signature through a legal e-sign provider (v1 records click-acceptance with evidence; see section 11.5).

- Automatic payout splitting between many parties beyond what Razorpay Route gives (decision in section 22).

- Multi-language UI (English first; structure strings so Hindi can be added).

## 2.3 Release milestones

| **Milestone**    | **Meaning**                                                      | **Exit criteria**                                                                                 |
|------------------|------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| M0 Local alpha   | Everything runs on your laptop                                   | Phases 0 to 6 of section 19 done, all tests green, one full booking with test payment             |
| M1 Staging       | Deployed on Vercel, Render and Neon with real domains            | Phase 7 done, staging go-live checklist passes, cold-start flow tested                            |
| M2 Friendly beta | 5 to 10 real providers, payments in test mode or offline advance | Phase 8 done, no data-loss bugs for two weeks                                                     |
| M3 Paid launch   | Live payments enabled                                            | Cost gates in section 16.8 cleared, Razorpay live KYC complete, backups proven by a restore drill |
| M4 Scale-out     | Migrate off free tiers                                           | Triggers in section 16.9 reached                                                                  |

# 3. Roles and permissions

| **Role**          | **How they authenticate**                                                               | **Can do**                                                                                       |
|-------------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Visitor           | None                                                                                    | View a published provider page, see availability, start a booking (needs OTP to hold)            |
| Customer          | Email OTP only, per booking, no password                                                | Hold a slot, accept terms, pay, view and cancel their own bookings through an access link        |
| Provider (vendor) | Email OTP at signup plus password; later password or OTP                                | Manage own profile, services, availability, bookings, payments view, settings                    |
| Admin             | Same as provider plus is_admin flag set only in the database, plus a second factor (P1) | Read all operational data, retry jobs, resend emails, mark records; never read passwords or OTPs |
| System            | Scheduler secret and Razorpay webhook secret                                            | Run jobs, process webhooks                                                                       |

## 3.1 Permission matrix

| **Action**                     | **Visitor** | **Customer**    | **Provider**              | **Admin**       |
|--------------------------------|-------------|-----------------|---------------------------|-----------------|
| View published provider page   | Yes         | Yes             | Yes                       | Yes             |
| View unpublished page          | No (404)    | No (404)        | Own only                  | Yes             |
| Create hold on a slot          | After OTP   | Yes             | No (own page)             | No              |
| View a booking                 | No          | Own, via token  | Own bookings only         | Yes             |
| Cancel a booking               | No          | Own, per policy | Own, with reason          | Yes, with audit |
| Edit services and availability | No          | No              | Own only                  | No (view only)  |
| Record offline advance         | No          | No              | Own bookings only         | Yes, with audit |
| Refund a payment               | No          | Request         | Initiate for own bookings | Yes, with audit |
| Read other users' data         | No          | No              | No                        | Yes, logged     |
| Run scheduled jobs manually    | No          | No              | No                        | Yes             |

> **Rule** Every API handler derives the actor from the session or token. It never reads a role, vendor id, customer id or price from the request body. Ownership is checked in one shared function, not repeated in each route.

# 4. Functional requirements

Each requirement has an ID, a priority and an acceptance test written so that it can become an automated test. A phase in section 19 is complete only when the requirements it lists pass.

## 4.1 Authentication and accounts (AU)

| **ID** | **Pri** | **Requirement**                                                                                         | **Acceptance**                                                                                        |
|--------|---------|---------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| AU-01  | P0      | Vendor signup needs a verified email OTP, or Google sign-in with a Google-verified email. A password is optional (set later in Settings) | A password without a valid OTP creates nothing; a valid OTP alone creates the account; a password, if given, must meet the rules |
| AU-02  | P0      | Returning vendor can sign in with Google, an email OTP, or a password if one is set                    | Every path creates a fresh session; password login on an account without one fails like a wrong password; the last sign-in method cannot be removed |
| AU-03  | P0      | One account per email, case-insensitive                                                                 | A@x.com and a@x.com collide; a second signup attempt behaves like sign-in without revealing existence |
| AU-04  | P0      | Auth endpoints never reveal whether an email has an account                                             | Same status, same body shape and similar timing for known and unknown emails                          |
| AU-05  | P0      | OTP is 6 digits, bound to a purpose, valid 10 minutes, 5 attempts, single use, resend cooldown 60 s     | Sixth wrong attempt locks the code; reused code fails; wrong purpose fails                            |
| AU-06  | P0      | Sessions are random tokens stored hashed, httpOnly, SameSite=Lax, Secure in production, revocable       | Logout invalidates server-side; token in DB is a hash only                                            |
| AU-07  | P0      | Password reset by OTP; resets revoke all sessions                                                       | After reset, old sessions return 401                                                                  |
| AU-08  | P1      | Account page lists active sessions with revoke                                                          | Revoked session fails on next request                                                                 |
| AU-09  | P1      | Rate limits per IP and per email on every auth endpoint                                                 | Burst of 20 requests returns 429 with Retry-After                                                     |
| AU-10  | P1      | Admin sign-in needs a second factor                                                                     | Admin without second factor cannot open /admin                                                        |

## 4.2 Vendor profile and public page (VN, PB)

| **ID** | **Pri** | **Requirement**                                                                                             | **Acceptance**                                                                |
|--------|---------|-------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| VN-01  | P0      | Onboarding wizard: business name, slug, category, city, timezone, contact preferences                       | Wizard cannot finish with an invalid or reserved slug                         |
| VN-02  | P0      | Slug is unique, lowercase, 3 to 40 chars, a-z0-9-, with a reserved-word list (admin, api, login, book, ...) | Reserved and duplicate slugs rejected                                         |
| VN-03  | P0      | Publish toggle. Only published vendors are public; unpublished and unknown slugs return the identical 404   | Responses are byte-equivalent in status and body                              |
| VN-04  | P1      | Profile: logo, cover, bio, social links, gallery up to 12 images, FAQ                                       | Image uploads are type- and size-checked; EXIF stripped                       |
| VN-05  | P0      | Owner email and phone are never public unless the vendor opts in                                            | Public JSON contains neither field by default                                 |
| VN-06  | P1      | Vendor can set payout details (bank or UPI) and complete provider KYC for Razorpay                          | Status shown as pending, verified or rejected; no raw account numbers in logs |
| PB-01  | P0      | bayana.in/\<slug\> renders on server for SEO and fast first paint, with Open Graph tags                     | HTML contains vendor name and services without JavaScript                     |
| PB-02  | P1      | Share kit: copy link, QR code, WhatsApp share text                                                          | QR decodes to the page URL                                                    |

## 4.3 Services and availability (SV, AV)

| **ID** | **Pri** | **Requirement**                                                                                                                       | **Acceptance**                                                |
|--------|---------|---------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| SV-01  | P0      | A service has name, description, duration (minutes), price (paise), advance rule, buffer before and after, active flag                | Zero or negative price or duration rejected                   |
| SV-02  | P0      | Advance rule is either a percentage (1 to 100) or a fixed paise amount, never above the price                                         | Advance 120 percent rejected; computed advance rounds half up |
| SV-03  | P0      | Per-service cancellation policy as tiers (for example full refund of advance if more than 7 days before)                              | Policy editor validates tiers are ordered and non-overlapping |
| SV-04  | P1      | Optional intake questions per service, answered by the customer at booking                                                            | Required question blocks submit when empty                    |
| AV-01  | P0      | Weekly availability as time windows per weekday in the vendor's timezone                                                              | Windows cannot overlap; end after start                       |
| AV-02  | P0      | Date overrides: block a day or range, or open extra hours on a date                                                                   | Override beats weekly rule for that date                      |
| AV-03  | P0      | Minimum notice and maximum advance window (for example 24 h to 180 days)                                                              | Slots outside the window are not offered                      |
| AV-04  | P0      | Slot engine returns only slots that fit duration plus buffers, are not overlapped by active bookings or blocks, and are in the future | Property tests in section 9.4 pass, including DST edge cases  |
| AV-05  | P1      | Per-day booking mode (see "Service modes" below): a service is charged per hour or per day; daily bookings cover 1 to 30 whole local days | Overlap with any booking of the vendor is impossible (constraint) |
| AV-07  | P1      | Multi-session booking (see "Sessions" below): an hourly booking is 1 to 12 consecutive sessions on one local day, priced per session | Any overlap is impossible (constraint); a range crossing a break, closing or midnight is refused |
| AV-06  | P1      | Calendar feed (iCal URL, read-only) for the vendor to subscribe in Google or Apple Calendar                                           | Feed lists confirmed bookings only, uses a secret token       |

### Service modes, day boundaries and daily availability (added with migration 021)

**Modes.** Each service has `booking_mode`: `hourly` (default) or `daily`.
- `hourly`: `price_paise` is the price of one session of `duration_minutes`, with buffer minutes before and after. Unchanged.
- `daily`: `price_paise` is the price **per day**; the vendor sets `min_days` (default 1) and `max_days` (default 1, at most 30) and optional `buffer_days` (0 to 7). Daily services have no duration or minute buffers. A database CHECK (`services_mode_fields`) requires exactly the chosen mode's fields and NULL for the other mode's. Services created before migration 021 as `TIMED` are `hourly`; `FULL_DAY` ones are `daily` with 1 to 1 day.

**Day boundaries.** A day is a local calendar date in the vendor's IANA timezone. A daily booking of N days from local date D occupies the half-open range [start of D, start of D+N), stored in UTC (`starts_at`, `ends_at`). "Start of a date" is local midnight, or the first local minute that exists when a daylight-saving change skips midnight. Days therefore last 23, 24 or 25 hours, and back-to-back bookings touch without overlapping. Buffer days widen `block_start`/`block_end` by whole local days on each side; each booking keeps its own buffer. The exclusion constraint (8.3) applies unchanged, so a daily booking blocks every hourly booking of the same vendor on those days, and the reverse.

**Daily availability.** For a daily service, a local date is:
- `past` before today, or when its start falls inside the minimum notice;
- `closed` beyond the maximum advance window, when it has no opening hours (a weekday is open if it has any weekly window, and a whole-day block override closes it), or when any time off touches it;
- `booked` when any active booking or unexpired hold (any service, with its buffers) touches it;
- otherwise `available`.

A booking of N days from D needs every day D..D+N-1 available and its buffer days free of bookings (buffer days need not be open). `GET /v1/vendors/:slug/availability/days?service_id=&month=` (or `from`/`to`, at most 62 days) returns each date's status and `max_days`, the longest booking that can start there. It is never cached.

**Holds and money.** The client sends only `service_id`, `date` and `days`. The server checks the service's stored mode and min/max, recomputes the range, and sets total = price per day x days (integer paise), with the advance from the service's rule (never above the total). The booking snapshots `booking_mode`, `days_count`, `service_price_paise` (per day), `total_paise`, `advance_paise` and `vendor_timezone`. Daily bookings are always shown as dates ("12 Nov to 13 Nov 2026 (2 days)"), never as a time; the calendar feed lists them as all-day events with an exclusive end date.

### Sessions: multi-block hourly bookings (added with migration 022)

**Block model.** For an hourly service, `duration_minutes` is the length of one **session** (a block, for example 60 or 90 minutes) and `price_paise` is the price of **one session**, never a per-hour rate. The service also has `min_blocks` (default 1) and `max_blocks` (default 1, at most 12); `duration_minutes x max_blocks` must fit in 24 hours. Daily services have both NULL (database CHECK `services_blocks`). Services created before migration 022 have 1 and 1, so they book exactly one session, as before. The UI calls blocks "sessions" and never says "per hour".

**One booking is one continuous range.** A booking of N sessions from start S occupies [S, S + N x duration), computed on the server in the vendor's timezone (real elapsed minutes, so the UTC times are correct across a daylight-saving change). It is valid only if:
- every session is inside one open span of that local day (weekly windows plus overrides, minus blocked hours), so it never crosses a break, blocked hours or closing time;
- the range ends on the same local date (it may end exactly at local midnight, never after);
- S is after the minimum notice and the date is inside the booking window;
- the buffered range [S - buffer before, S + N x duration + buffer after) touches no time off and no other active booking or unexpired hold.
The buffers apply **once**, around the whole range, never per session. Sessions on different days, or with gaps, are separate bookings (out of scope as one booking); for several days the vendor offers a per-day service.

**Availability.** `GET /v1/vendors/:slug/availability/slots?service_id=&date=` lists each bookable start with `maxBlocks`, the most consecutive sessions free from it (up to `max_blocks`); a start where fewer than `min_blocks` fit is not listed (its value is 0). Each slot's `endsAt` describes the shortest booking (`min_blocks` sessions). The response carries `min_blocks` and `max_blocks` and is never cached.

**Holds and money.** The client sends only `service_id`, `starts_at` and `blocks` (absent means 1). The server checks `min_blocks <= blocks <= max_blocks`, recomputes the range with the engine, and sets **total = price per session x blocks** (integer paise) and the advance by the service's rule on that total (round half up, never above the total). The booking snapshots `blocks_count`, `block_minutes` (the session length), `duration_minutes` (the whole length), `service_price_paise` (per session), `total_paise`, `advance_paise` and both buffers. The exclusion constraint (8.3) and the per-vendor transaction lock remain the only overlap protection; only `transitionBooking` changes status. A vendor's manual booking takes the same `blocks`, and a reschedule keeps the booking's length.

**Display.** A booking of more than one session is always shown as its whole range, for example "Fri, 12 Nov, 2:00 pm to 5:00 pm (3 hours)": booking page, dashboard lists and calendar, emails (hold, confirmation, reminder, reschedule, cancellation), contract ("Date and time: ..., 2:00 pm to 5:00 pm, 3 hours", plus "Price per session: X x 3 sessions of 1 hour"), receipt and the calendar feed (its real start and end). A one-session booking reads exactly as before, so contracts already shown keep their hash.

## 4.4 Booking (BK)

| **ID** | **Pri** | **Requirement**                                                                                            | **Acceptance**                                                                                 |
|--------|---------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| BK-01  | P0      | Customer selects a service and slot, enters name, email, phone, notes                                      | Server recomputes start, end and price; client values are ignored                              |
| BK-02  | P0      | Customer verifies email by OTP before a hold is created (purpose booking_verify)                           | No hold without a valid OTP                                                                    |
| BK-03  | P0      | A hold reserves the slot for 15 minutes (configurable)                                                     | Second customer cannot book the held slot; it reappears after expiry                           |
| BK-04  | P0      | The database forbids overlapping active bookings for one vendor (exclusion constraint)                     | Two concurrent requests for overlapping slots: exactly one succeeds, the other gets SLOT_TAKEN |
| BK-05  | P0      | Idempotency key on hold creation                                                                           | Same key twice returns the same booking, not two                                               |
| BK-06  | P0      | Service name, price, duration, advance rule and terms are snapshotted onto the booking                     | Editing the service later does not change existing bookings                                    |
| BK-07  | P0      | All status changes go through transitionBooking, which writes a booking_events row in the same transaction | Grep finds no other UPDATE bookings SET status                                                 |
| BK-08  | P0      | Customer gets a private booking link with an unguessable token; no login needed                            | Token is 32 random bytes, stored hashed; wrong token is 404                                    |
| BK-09  | P1      | Reschedule by customer or vendor within policy; keeps payment, creates events                              | Rescheduling onto a taken slot fails atomically                                                |
| BK-10  | P1      | Cancellation by customer follows the snapshotted policy and shows the refund amount before confirming      | Refund preview equals the refund actually issued                                               |
| BK-11  | P1      | Vendor can cancel with a reason; customer is notified and refunded in full                                 | Event log records actor and reason                                                             |
| BK-12  | P1      | Vendor marks a booking completed after the event                                                           | Only confirmed bookings in the past can be completed                                           |
| BK-13  | P1      | Vendor can create a manual booking (walk-in or phone) that uses the same slot guard                        | Manual booking blocks the slot for customers immediately                                       |

## 4.5 Payments (PY)

| **ID** | **Pri** | **Requirement**                                                                                                                 | **Acceptance**                                                               |
|--------|---------|---------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| PY-01  | P0      | PAYMENT_MODE is disabled, test or live; default disabled; startup fails on key and mode mismatch                                | An rzp_live\_ key with mode test aborts boot                                 |
| PY-02  | P0      | Orders are created on the server from the booking snapshot                                                                      | Tampered amount in the browser has no effect                                 |
| PY-03  | P0      | Checkout signature verified with HMAC and timing-safe compare                                                                   | Bad signature returns 400 and confirms nothing                               |
| PY-04  | P0      | Webhook verified on the raw body, deduplicated by x-razorpay-event-id, and checked against stored order id, amount and currency | Replaying the same event changes nothing; mismatched amount flags for review |
| PY-05  | P0      | A booking is confirmed only in the transaction that records a verified payment or a vendor-recorded offline advance             | No code path sets CONFIRMED without a payment row                            |
| PY-06  | P0      | Late payment after hold expiry: re-claim the slot if free, else auto-refund and notify                                          | Both branches covered by tests                                               |
| PY-07  | P0      | Remaining balance is shown on both dashboards as total - paid                                                                   | Numbers equal the sum of payment rows                                        |
| PY-08  | P1      | Refunds through Razorpay with a stored refund record                                                                            | Refund row links to payment and booking                                      |
| PY-09  | P1      | Nightly reconcile compares Razorpay with the local ledger and flags differences                                                 | Injected mismatch appears in admin                                           |
| PY-10  | P1      | Vendor can record cash or UPI paid offline (advance or balance) with note; audited                                              | Entry appears in ledger tagged offline                                       |
| PY-11  | P1      | Receipts (PDF) for each payment, with GST fields when the vendor provides GSTIN                                                 | PDF totals match ledger                                                      |
| PY-12  | P2      | Balance payment link sent before the event, paid online                                                                         | Balance order settles the booking to fully paid                              |

## 4.6 Contract and terms (CT)

| **ID** | **Pri** | **Requirement**                                                                                 | **Acceptance**                                               |
|--------|---------|-------------------------------------------------------------------------------------------------|--------------------------------------------------------------|
| CT-01  | P0      | Vendor edits terms per service from a safe template (plain text with variables)                 | Unknown variables rejected                                   |
| CT-02  | P0      | At acceptance the final text is rendered with the booking values and frozen with a SHA-256 hash | Changing the template later does not alter a stored contract |
| CT-03  | P0      | Acceptance records the time, IP, user agent, email and terms hash                               | Evidence row exists for each confirmed booking               |
| CT-04  | P1      | Both parties can download the contract as PDF                                                   | PDF text equals stored text                                  |
| CT-05  | P1      | Key terms (advance, balance, cancellation) are shown above the fold before acceptance           | Visual regression test on the booking page                   |

## 4.7 Notifications (NT)

| **ID** | **Pri** | **Requirement**                                                                                                | **Acceptance**                                                      |
|--------|---------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| NT-01  | P0      | Emails go through an outbox table; a send failure never fails the user action                                  | Killing SMTP does not break booking; outbox shows failed with retry |
| NT-02  | P0      | Templates: OTP, hold started, booking confirmed (customer and vendor), cancellation, refund, reminder, receipt | Each renders with plain-text alternative                            |
| NT-03  | P1      | Reminders at 24 hours before the event, sent by the scheduled tick                                             | Reminder is sent once even if ticks overlap                         |
| NT-04  | P1      | Daily cap awareness: when near the provider's daily email limit, OTP and payment emails go first               | Low-priority mail waits when the cap is near                        |
| NT-05  | P2      | WhatsApp or SMS channel through the same outbox abstraction                                                    | Channel is a column, not a rewrite                                  |

## 4.8 Admin and operations (AD)

| **ID** | **Pri** | **Requirement**                                                                               | **Acceptance**                         |
|--------|---------|-----------------------------------------------------------------------------------------------|----------------------------------------|
| AD-01  | P1      | Admin list and detail of users, vendors, bookings, payments, webhooks, email outbox, job runs | Search by email and booking id works   |
| AD-02  | P1      | Admin can retry a failed email or job and re-verify a payment against Razorpay                | Action writes an audit row             |
| AD-03  | P1      | Health page: DB reachable, last tick time, outbox backlog, last webhook, last reconcile       | Stale tick (over 30 minutes) shows red |
| AD-04  | P1      | Every admin read of another user's data is logged                                             | Audit table receives a row per view    |

## 4.9 Privacy and compliance (PV)

| **ID** | **Pri** | **Requirement**                                                                                                           | **Acceptance**                                          |
|--------|---------|---------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| PV-01  | P0      | Privacy policy, terms of service and refund policy pages; consent captured at signup and booking with a timestamp         | Consent row stored per user and per booking             |
| PV-02  | P1      | User can export their data (JSON) and request deletion; financial records are retained as the law requires and anonymised | Deletion keeps ledger rows with personal fields removed |
| PV-03  | P1      | No card data touches Bayana servers; no raw bank details are logged                                                       | Log scan test finds no card or account patterns         |

# 5. Experience design and page inventory

## 5.1 Design principles

- **Mobile first.** Most customers arrive from a WhatsApp or Instagram link on a phone. Design at 375 px wide first.

- **Calm trust at the payment step.** Plain language, visible total, advance and balance, a lock icon only where it is true.

- **Honest states.** Loading uses skeletons, errors say what to do next, empty states tell the vendor the first action.

- **Accessibility.** WCAG 2.1 AA target: contrast, focus order, labels, keyboard use, touch targets of at least 44 px.

- **Fast.** Public page and booking flow target Largest Contentful Paint under 2.5 s on a mid-range phone with 4G.

## 5.2 Public and customer pages

| **Route**                                    | **Purpose**                                                                  | **Key states**                                            |
|----------------------------------------------|------------------------------------------------------------------------------|-----------------------------------------------------------|
| /                                            | Marketing home: value, how it works, pricing, sign-up call to action         | Static, cached                                            |
| /pricing, /about, /privacy, /terms, /refunds | Marketing and legal                                                          | Static                                                    |
| /\<slug\>                                    | Provider public page: bio, services, gallery, book button                    | Published, unpublished (404), no services                 |
| /\<slug\>/book?service=                      | Booking flow: slot, details, OTP, terms, payment                             | Slot taken, hold expired, payment pending, payment failed |
| /b/\<bookingId\>?t=\<token\>                 | Customer booking page: status, contract, payment history, cancel, reschedule | Held, pending, confirmed, completed, cancelled, expired   |
| /waking                                      | Friendly interstitial shown while the API wakes from sleep (section 16.6)    | Auto-retry with progress                                  |

## 5.3 Vendor dashboard

| **Route**                | **Purpose**                                                                                      |
|--------------------------|--------------------------------------------------------------------------------------------------|
| /login, /signup, /forgot | Auth screens with password and OTP choices                                                       |
| /onboarding              | Wizard: profile, first service, availability, publish                                            |
| /dashboard               | Today and next 7 days, money summary, to-do (for example connect payouts)                        |
| /dashboard/calendar      | Month and week views; confirmed, held and blocked are colour-coded; click a slot to see or block |
| /dashboard/bookings      | List with filters; detail with timeline, payment ledger, contract, actions                       |
| /dashboard/services      | Create, edit, reorder services; terms and cancellation tiers                                     |
| /dashboard/availability  | Weekly windows, overrides, notice and window settings                                            |
| /dashboard/payments      | Ledger, balances due, refunds, payout status                                                     |
| /dashboard/customers     | Customer list with booking history                                                               |
| /dashboard/settings      | Profile, public page, notifications, payout and KYC, sessions, export and delete                 |

## 5.4 Admin console

Routes under /admin: overview and health, users, vendors, bookings, payments, webhooks, email outbox, job runs, audit log. Visible only to admin users with a second factor, and excluded from search engines.

## 5.5 Booking flow, step by step

1.  Customer opens the provider link and selects a service.

2.  The page shows the next available days; the customer picks a slot. Times are shown in the provider's timezone with the customer's local time beside them if different.

3.  Customer enters name, email, phone and answers intake questions.

4.  Customer enters the emailed OTP. On success the server creates a HELD booking and starts a 15-minute countdown shown on screen.

5.  Customer reads key terms (advance, balance, cancellation) above the fold, opens the full text if wanted, and ticks acceptance.

6.  Customer pays the advance in Razorpay Checkout. If payment is disabled in this environment, the page says so honestly and the vendor can record an offline advance instead.

7.  The server verifies payment, confirms the booking in one transaction and shows a confirmation with the contract, receipt and calendar download.

8.  Both parties receive an email. The vendor sees the booking appear on the calendar.

## 5.6 Error and empty-state copy rules

- Say what happened, why, and what to do: "This time was just booked. Pick another time below." Never show raw codes.

- Use the same human sentences for the same error code across web and email.

- Empty vendor dashboard shows a three-step checklist, not a blank table.

# 6. System architecture

## 6.1 Overview

Bayana is a three-tier web application. The browser talks to a Next.js web app for pages and to an Express API for data. The API owns all business rules and is the only component that talks to PostgreSQL, Razorpay and the email provider. GitHub Actions runs CI, applies migrations and pings the API on a schedule, because the free Render plan has no background workers or cron.


*Figure 1. System context and deployment topology*

## 6.2 Responsibilities

| **Component**              | **Owns**                                                                                     | **Must never**                                                           |
|----------------------------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| Next.js web (Vercel)       | Rendering, routing, forms, SEO, calling the API                                              | Hold secrets, compute prices, decide availability, write to the database |
| Express API (Render)       | Auth, validation, availability, booking transactions, payments, webhooks, jobs, email outbox | Trust client input for role, price, vendor id or payment status          |
| PostgreSQL (Neon)          | Truth: data and the integrity constraints (no overlap, unique email, unique idempotency)     | Depend on the app being correct for double-booking safety                |
| Scheduler (GitHub Actions) | Calling POST /internal/jobs/tick every few minutes                                           | Contain business logic                                                   |
| Razorpay                   | Taking money, refunds, webhooks                                                              | Be the only record: every event is mirrored into the local ledger        |
| Brevo                      | Delivering email                                                                             | Be on the critical path of a booking                                     |
| Sentry                     | Errors and traces                                                                            | Receive personal data or secrets                                         |

## 6.3 Key architectural decisions

| **Decision**    | **Choice**                                                            | **Reason**                                                                             | **Revisit when**                             |
|-----------------|-----------------------------------------------------------------------|----------------------------------------------------------------------------------------|----------------------------------------------|
| Monorepo        | pnpm workspace: apps/web, apps/api, packages/shared                   | One repo, shared Zod schemas and types, one CI                                         | Never for a solo founder                     |
| Database access | Raw SQL with a thin typed helper and forward-only migrations          | Exclusion constraints, advisory locks and FOR UPDATE are first-class; no ORM surprises | A second developer wants an ORM              |
| Auth            | First-party: sessions in the database, Argon2id                       | Needs OTP plus password plus customer-OTP flows no library fits cleanly                | Enterprise SSO is required                   |
| Jobs            | No queue server. Postgres tables and a secret-protected tick endpoint | Free tier has no workers; Postgres is enough at this scale                             | Over 50 emails a minute or long-running jobs |
| Sleep tolerance | Correctness never depends on timers                                   | Render free sleeps after 15 minutes idle                                               | Move to a paid always-on instance            |
| Custom domains  | bayana.in for web, api.bayana.in for API                              | Same-site cookies work; no third-party cookie problems                                 | Never                                        |

# 7. Technology stack

| **Layer**            | **Choice**                                                                       | **Notes**                                                                      |
|----------------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Language             | TypeScript, strict mode, Node.js 22 LTS                                          | No any; use unknown plus Zod                                                   |
| Web                  | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui components            | Server Components by default; params, cookies() and headers() are async in v15 |
| Forms and validation | React Hook Form with Zod resolvers; schemas in @bayana/shared                    | Same schema on both sides                                                      |
| Server state         | TanStack Query for client components that poll or mutate                         | Not a global store                                                             |
| API                  | Express 5, Zod validation middleware, Pino logging, helmet, cors                 | One error shape, central handler                                               |
| Database             | PostgreSQL 16 (Neon in cloud, Docker locally), extension btree_gist              | Verify extension on Neon during phase 1                                        |
| DB driver            | pg (node-postgres) with a small query helper and transaction wrapper             | Pooled URL for runtime, direct URL for migrations                              |
| Migrations           | Plain .sql files, numbered, forward-only, run by a small Node script             | 001 to 003 exist; never edit an applied file                                   |
| Password hashing     | argon2 (argon2id). Fall back to bcryptjs cost 12 only if argon2 will not install | Windows install problems are the only reason for fallback                      |
| Email                | Nodemailer over Brevo SMTP; React Email or plain MJML templates                  | Sender hello@bayana.in                                                         |
| Payments             | Razorpay Node SDK, Checkout.js on the web                                        | Mode flag controls everything                                                  |
| PDF                  | pdf-lib or @react-pdf/renderer for receipts and contracts                        | Server-side, no headless browser on free tier                                  |
| Images               | Cloudflare R2 or Vercel Blob for uploads (decision D5)                           | Free tiers are enough for the beta                                             |
| Time                 | Luxon or date-fns-tz for IANA timezones                                          | Never manual offsets                                                           |
| Testing              | Vitest, Supertest, Playwright, Testcontainers or a Docker test database          | DB name must end in \_test                                                     |
| Quality              | ESLint, Prettier, tsc --noEmit, Husky pre-commit (optional)                      | CI runs the same commands                                                      |
| Observability        | Pino JSON logs, Sentry, an uptime monitor, /health and /ready                    | Section 17                                                                     |
| CI/CD                | GitHub Actions; Vercel and Render deploy from the main branch                    | Migrations run from CI before the API deploy                                   |

> **Windows note** The developer machine is Windows with PowerShell. Call pnpm.cmd in scripts and docs. Package scripts must not use bash-only syntax; use cross-env or small Node scripts. If the repo lives inside OneDrive and you see EPERM, EBUSY or very slow installs, move it to a non-synced folder such as C:\dev\bayana.

# 8. Data model

## 8.1 Rules for every table

- Primary keys are UUIDs (gen_random_uuid()); no sequential ids in URLs.

- Every table has created_at timestamptz not null default now(); mutable tables also have updated_at maintained by a trigger.

- Money columns are bigint paise with check (x \>= 0). Currency is char(3) and is INR in v1.

- Status columns are text with a check constraint listing allowed values (easier to migrate than enum types).

- Foreign keys have explicit on delete behaviour. Financial and audit rows are never cascade-deleted.

- Emails are stored as citext or a lowercase email_normalized column with a unique index.

## 8.2 Entities

| **Table**              | **Purpose**                                 | **Important columns and constraints**                                                                                                                                                                                                                                        |
|------------------------|---------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| users                  | One row per human account (vendor or admin) | email_normalized unique; password_hash nullable until set; email_verified_at; is_admin; status                                                                                                                                                                               |
| vendors                | Provider profile, one per vendor user       | user_id unique; slug unique lowercase; timezone (IANA); published; category; payout_status; contact_public flags                                                                                                                                                             |
| sessions               | Server sessions                             | token_hash unique; user_id; expires_at; revoked_at; ip; user_agent                                                                                                                                                                                                           |
| otp_codes              | Email one-time codes                        | email_normalized; purpose; code_hmac; expires_at; attempts; consumed_at; last_sent_at                                                                                                                                                                                        |
| services               | What a vendor sells                         | vendor_id; duration_min; price_paise; advance_kind (percent\|fixed); advance_value; buffer_before_min; buffer_after_min; terms_template; cancellation_tiers (jsonb, validated by Zod); active                                                                                |
| availability_rules     | Weekly windows                              | vendor_id; weekday 0-6; start_local time; end_local time; check end \> start                                                                                                                                                                                                 |
| availability_overrides | Blocks and extra hours on a date            | vendor_id; local_date; kind (block\|open); optional window; note                                                                                                                                                                                                             |
| customers              | People who book (no password)               | vendor_id; email_normalized; name; phone; unique (vendor_id, email_normalized)                                                                                                                                                                                               |
| bookings               | The central record                          | vendor_id; customer_id; service_id; status; starts_at; ends_at; block_start; block_end; hold_expires_at; idempotency_key unique per vendor; snapshot columns (svc_name, price_paise, advance_paise, terms_text, terms_hash); access_token_hash; exclusion constraint (below) |
| booking_events         | Append-only history                         | booking_id; from_status; to_status; actor_type; actor_id; reason; meta jsonb; no update or delete grants                                                                                                                                                                     |
| payments               | Money in                                    | booking_id; provider (razorpay\|offline); provider_order_id; provider_payment_id unique; amount_paise; status; kind (advance\|balance); verified_at; raw jsonb                                                                                                               |
| refunds                | Money out                                   | payment_id; amount_paise; status; provider_refund_id; reason                                                                                                                                                                                                                 |
| webhook_events         | Dedup and audit of provider webhooks        | event_id unique; type; payload jsonb; received_at; processed_at; error                                                                                                                                                                                                       |
| contract_acceptances   | Evidence of acceptance                      | booking_id unique; terms_hash; accepted_at; ip; user_agent; email                                                                                                                                                                                                            |
| email_outbox           | Reliable email sending                      | to_email; template; payload; status; attempts; next_attempt_at; sent_at; last_error; priority                                                                                                                                                                                |
| job_runs               | Scheduler audit                             | job; started_at; finished_at; ok; details                                                                                                                                                                                                                                    |
| audit_log              | Admin and sensitive actions                 | actor_id; action; target_type; target_id; meta; at                                                                                                                                                                                                                           |
| consents               | Policy acceptance                           | subject_type; subject_id; policy; version; at; ip                                                                                                                                                                                                                            |

## 8.3 The double-booking guard

The exclusion constraint is the single most important line in the system. It lives in a migration, not in application code. The range includes buffers so two bookings can never overlap including their setup and cleanup time.

> CREATE EXTENSION IF NOT EXISTS btree_gist;
>
> ALTER TABLE bookings
>
> ADD CONSTRAINT bookings_no_overlap
>
> EXCLUDE USING gist (
>
> vendor_id WITH =,
>
> tstzrange(block_start, block_end, '\[)') WITH &&
>
> ) WHERE (status IN ('held','pending','confirmed'));
>
> ALTER TABLE bookings ADD CONSTRAINT bookings_block_valid
>
> CHECK (block_start \<= starts_at AND starts_at \< ends_at AND ends_at \<= block_end);
>
> **Why not a generated column** block_start and block_end are written by the server inside the transaction because adding an interval to a timestamptz is not immutable in PostgreSQL, so it cannot be used in a generated column or index expression. The tstzrange(...) call with a text bound argument is immutable and is allowed in the constraint.

PostgreSQL does not know that a hold has expired by the clock. The booking transaction therefore first moves that vendor's expired holds to EXPIRED (through transitionBooking), then inserts the new booking. Overlap errors surface as SQLSTATE 23P01 and are translated to the API error SLOT_TAKEN.

## 8.4 Integrity rules enforced in the database

| **Rule**                                   | **Mechanism**                                                                        |
|--------------------------------------------|--------------------------------------------------------------------------------------|
| No overlapping active bookings per vendor  | Exclusion constraint above                                                           |
| One account per email                      | Unique index on users.email_normalized                                               |
| One booking per idempotency key            | Unique (vendor_id, idempotency_key)                                                  |
| A payment is recorded once                 | Unique provider_payment_id; unique webhook_events.event_id                           |
| Advance never exceeds price                | check (advance_paise \<= price_paise)                                                |
| Booking history cannot be rewritten        | Application role has INSERT, SELECT only on booking_events (revoke UPDATE, DELETE)   |
| Confirmed implies paid or offline-recorded | Enforced in transitionBooking; checked by a nightly consistency query (section 17.4) |

## 8.5 Migration discipline

- Files apps/api/sql/NNN_name.sql, next free number, never edit an applied file. Each runs in a transaction. A schema_migrations table records applied files with a checksum; a changed checksum fails startup.

- Destructive changes (drop or rename) require a written backup step first and are split into expand, migrate, contract migrations.

- Migrations run against the Neon **direct** connection, from CI or the founder's terminal, never from the running API.

- Seeds are idempotent, development only, and refuse to run when NODE_ENV=production.

# 9. Availability and scheduling engine

## 9.1 Inputs and output

The slot engine is a pure function: given a vendor's timezone, weekly rules, overrides, the service (duration and buffers), booking rules (minimum notice, maximum window, slot step), the vendor's active bookings in the range, and now, it returns a list of start times that can be booked. Being pure means it can be tested exhaustively without a database.

## 9.2 Algorithm

1.  Expand the date range into local calendar dates in the vendor's timezone.

2.  For each date, take the weekly windows for that weekday, then apply overrides: a block removes the day or a window, an open adds a window.

3.  Convert each window's local start and end into UTC instants using the timezone library. Handle DST: a missing local hour does not exist and a repeated local hour exists twice; windows that cross either are clipped, never guessed.

4.  Step through each window at the slot step (default equal to the service duration, configurable, for example 30 minutes) producing candidate starts.

5.  A candidate is valid if \[start - buffer_before, end + buffer_after) fits inside the window and does not overlap any active booking range or block, and start \>= now + min_notice and start \<= now + max_window.

6.  Return candidates grouped by date with the vendor-local label and the UTC instant.

## 9.3 Races between viewing and booking

The calendar the customer sees is advice. The truth is the exclusion constraint at insert time. When a customer selects a slot, the server re-runs the same overlap check inside the transaction after taking a per-vendor advisory lock, then inserts. Vendor actions that block time (adding an override, creating a manual booking) take the **same** advisory lock, so a block and a booking cannot interleave.

> BEGIN;
>
> SELECT pg_advisory_xact_lock(hashtextextended(\$vendor_id::text, 0));
>
> -- expire this vendor's old holds via transitionBooking(...)
>
> -- verify slot is inside availability and not blocked (engine, same code path)
>
> INSERT INTO bookings (...) VALUES (...); -- constraint is the last guard
>
> INSERT INTO booking_events (...);
>
> COMMIT;
>
> **Neon pooling** The Neon pooled endpoint uses PgBouncer in transaction mode. Transaction-level advisory locks (pg_advisory_xact_lock) are safe there; session-level locks and session settings are not. Never use pg_advisory_lock, SET without LOCAL, or LISTEN/NOTIFY on the pooled URL.

## 9.4 Required tests for the engine

- Property tests: no returned slot overlaps an active booking or block; every returned slot lies inside a window; results are sorted and unique.

- DST tests in Asia/Kolkata (no DST), and in at least two DST zones (for example Europe/London, America/New_York) for spring-forward and fall-back days, even though v1 targets India.

- Concurrency test: fire 20 simultaneous holds for the same slot with Promise.allSettled; exactly one succeeds, 19 return SLOT_TAKEN. Run the test 10 times in a row in CI.

- Vendor-block versus customer-hold race: same assertion, exactly one winner.

# 10. Booking lifecycle


*Figure 2. Booking state machine*

| **From**  | **To**    | **Trigger**                                                                     | **Guard**                                        |
|-----------|-----------|---------------------------------------------------------------------------------|--------------------------------------------------|
| (none)    | HELD      | Customer verified OTP and chose a slot                                          | Slot free; idempotency key new or matching       |
| HELD      | PENDING   | Customer accepted terms and a payment order was created                         | Hold not expired; terms hash stored              |
| HELD      | EXPIRED   | Hold timer passed (lazy or tick)                                                | hold_expires_at \< now                           |
| PENDING   | CONFIRMED | Verified payment of at least the advance, or offline advance recorded by vendor | Amount, currency and order id match the snapshot |
| PENDING   | EXPIRED   | Hold timer passed with no payment                                               | No verified payment exists                       |
| PENDING   | CANCELLED | Customer abandons or vendor cancels                                             | Actor allowed                                    |
| CONFIRMED | COMPLETED | Vendor marks done after the event                                               | ends_at \< now                                   |
| CONFIRMED | CANCELLED | Customer or vendor cancels                                                      | Refund computed from the snapshotted policy      |

## 10.1 One function changes status

transitionBooking(tx, bookingId, toStatus, actor, reason, meta) loads the booking FOR UPDATE, checks the transition against the table above, applies side effects that belong in the same transaction (for example creating a refund record), updates the status and inserts a booking_events row. It returns the new state or throws a typed error. Every caller, including jobs and webhooks, uses it. A lint rule or a test greps for any other UPDATE bookings SET status.

## 10.2 Expiry without timers

- **Lazy expiry:** any booking transaction first expires that vendor's overdue holds, so correctness never waits for a timer.

- **Tick expiry:** the scheduled tick expires all overdue holds so dashboards stay tidy.

- **Display:** the customer page treats a hold past its time as expired even before the tick runs.

# 11. Payments design

## 11.1 Modes

| **PAYMENT_MODE**   | **Behaviour**                                                                                               | **Allowed keys**                                          |
|--------------------|-------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| disabled (default) | Booking flow stops before payment; vendor can record an offline advance. Pages say payments are not enabled | None required                                             |
| test               | Razorpay test orders and test webhooks                                                                      | rzp_test\_ only                                           |
| live               | Real money                                                                                                  | rzp_live\_ only, and only after the gates in section 16.8 |

Startup aborts if the key type and mode disagree. The live mode cannot be switched on by an environment typo alone: it also requires a deliberate LIVE_PAYMENTS_ACK=yes variable that is set only in the production environment.

## 11.2 Happy-path sequence

1.  Browser calls POST /bookings/:id/payment-order. The API loads the booking snapshot, computes the advance in paise, calls Razorpay Orders with receipt = booking id, stores a payments row in status created, and returns the order id and public key id.

2.  Razorpay Checkout opens in the browser. On success it returns razorpay_payment_id, razorpay_order_id, razorpay_signature.

3.  Browser calls POST /bookings/:id/payment-verify. The API checks HMAC_SHA256(order_id + '\|' + payment_id, key_secret) with a timing-safe compare, loads the stored order, confirms amount and currency, and in one transaction marks the payment captured/verified and calls transitionBooking(... CONFIRMED).

4.  Razorpay also sends payment.captured (and order.paid) webhooks. The webhook handler is idempotent and does the same work if the browser path never ran (closed tab, lost network).

5.  Emails are queued in the outbox in the same transaction.

## 11.3 Webhook rules

- Read the **raw body** before JSON parsing and verify x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET.

- Insert webhook_events with the x-razorpay-event-id header as unique key. A duplicate returns 200 immediately.

- Return 2xx fast. Razorpay treats non-2xx as failure and retries with exponential backoff for 24 hours, then disables the webhook, so a long outage can silently stop events. Alert if no webhook has been received for an expected period and run the reconcile job.

- Check order id, amount and currency against stored values. A mismatch is stored with error and flagged in admin, not applied.

- Delivery is at least once and not ordered: handlers must tolerate order.paid before or after payment.captured.

## 11.4 Late and failed payments

| **Case**                                                           | **Handling**                                                                                                                             |
|--------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Payment succeeds after the hold expired and the slot is still free | Re-claim the slot through the normal booking guard, confirm, and email the customer                                                      |
| Payment succeeds after expiry and the slot is taken                | Create a refund for the full amount automatically, email the customer, flag in admin                                                     |
| Payment fails or the customer closes Checkout                      | Booking stays PENDING until the hold expires; customer can retry with a new order                                                        |
| API asleep when the webhook arrives                                | Razorpay retries; the first request wakes the API (about a minute on Render free). Boot-time and nightly reconcile catch anything missed |
| Amount or currency mismatch                                        | Do not confirm; flag for manual review                                                                                                   |
| Duplicate event                                                    | Dedup by event id; no change                                                                                                             |

## 11.5 Contract evidence (click-wrap)

v1 uses a click-wrap agreement: the customer ticks acceptance of the exact text shown. The server stores the frozen text, its SHA-256 hash, the time, IP address, user agent and verified email. This is good evidence of agreement but is not a licensed e-signature. Offer an Aadhaar or e-sign provider in a later phase if vendors need higher assurance for large contracts. Have a lawyer review the template wording before paid launch (decision D6).

## 11.6 Money movement to vendors

Two models exist, and the choice is a business and compliance decision (D1) to confirm with Razorpay before writing payout code:

| **Model**                           | **How it works**                                                                                           | **Pros**                                             | **Cons**                                                                                                  |
|-------------------------------------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| A. Platform collects, then pays out | Customer pays Bayana's Razorpay account; Bayana pays vendors via Razorpay Route linked accounts or payouts | Platform fee is deducted automatically; one checkout | Needs Route enabled and vendor KYC; Bayana carries settlement and refund responsibility; extra compliance |
| B. Vendor-owned gateway             | Each vendor connects their own Razorpay account; money goes straight to them                               | Bayana never holds funds; far less compliance        | Vendor onboarding friction; platform fee must be billed separately (subscription)                         |

> **Recommendation** Launch beta with offline advance recording plus test-mode payments, then choose model A or B before M3 once Razorpay confirms what your account can do. Build the ledger (payments, refunds) so both models fit.

## 11.7 Reconciliation

- Nightly job lists Razorpay payments and refunds for the last 48 hours and compares them to the local ledger by id and amount.

- On API boot, run a short reconcile for PENDING bookings that have an order but no verified payment.

- Differences create admin alerts; the admin screen has a button to re-verify a payment against the Razorpay API.

## 11.8 Fees and GST

Razorpay charges a percentage per transaction (confirm the current rate in the dashboard; it changes). Decide whether the vendor or the customer bears it and show the breakdown clearly. If Bayana charges a platform fee or subscription, GST applies once Bayana crosses the registration threshold or opts in; your CA decides (D7). Receipts include vendor GSTIN only when the vendor provides one.

# 12. Authentication, security and privacy

## 12.1 Authentication flows

| **Flow**                  | **Steps**                                                                                                                                                                                                                                              |
|---------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Vendor signup             | 1\) Enter email. 2) API sends OTP (purpose signup) and always answers the same way. 3) Enter the OTP. 4) API verifies it, creates the users row (no password) and starts a session; the vendor row is created by onboarding. A password can be added later in Settings |
| Google sign-in            | Authorization code flow with PKCE. /v1/auth/google/start stores state, nonce and PKCE verifier in a signed 10-minute httpOnly cookie (state hash also stored, single use) and redirects to Google (scope openid email profile). The callback checks state, exchanges the code, verifies the ID token (Google JWKS signature, iss, aud, exp, nonce) and requires email_verified. In one transaction: an existing Google identity signs in its user; else a user with the same email is linked; else a new vendor user is created and sent to onboarding. One user per email, no tokens stored, name and picture never trusted. Off when GOOGLE_CLIENT_ID is unset |
| Vendor sign-in (password) | Only for accounts that set one. Email and password. Wrong credentials, an unknown email and an account without a password return the same message and take similar time (hash a dummy when there is no hash) |
| Sign-in methods           | Settings lists Google (connect or disconnect), email code (always on once the email is verified) and password (set, change or remove; changes sign out other sessions). The last remaining method cannot be removed |
| Vendor sign-in (OTP)      | Email, OTP (purpose login). Same enumeration rules. This is the fix for returning vendors who cannot sign in                                                                                                                                           |
| Password reset            | Email, OTP (purpose reset), new password; all sessions revoked                                                                                                                                                                                         |
| Customer booking          | Email OTP (purpose booking_verify), no account, no password. Result is a booking access token, not a login session                                                                                                                                     |
| Logout and revoke         | Server deletes or revokes the session row; cookie cleared                                                                                                                                                                                              |

## 12.2 OTP design

- Generate with crypto.randomInt(0, 1000000) padded to six digits.

- Store HMAC-SHA256(pepper, email\|purpose\|code); never the code. The pepper is a server secret (OTP_PEPPER).

- Verify with a timing-safe compare. Increment attempts atomically (UPDATE ... SET attempts = attempts + 1 ... RETURNING) and refuse at 5.

- Mark consumed_at inside the same transaction that uses the code; a consumed code cannot be reused.

- Resend cooldown 60 s and a per-email and per-IP hourly cap, so OTP email cannot be abused to spam someone or to burn the 300 emails a day budget.

## 12.3 Sessions and cookies

- Session token: 32 random bytes, base64url. Only SHA-256(token) is stored.

- Cookie: httpOnly, Secure in production, SameSite=Lax, Path=/, and in production Domain=.bayana.in so bayana.in and api.bayana.in share it. Lifetime 30 days, sliding, with an absolute cap of 90 days. Rotate on login and on password change.

- Do not use Vercel preview URLs against the production API. Use stable staging hostnames (staging.bayana.in, api-staging.bayana.in) so the cookie domain works.

- Next.js server components must forward the incoming cookie to the API when fetching on the server.

## 12.4 Threat model summary

| **Threat**                                | **Control**                                                                                                                      |
|-------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Double booking by race or tampering       | Exclusion constraint plus advisory lock plus server-side time and price                                                          |
| Price or advance tampering                | Server recomputes from the booking snapshot; browser values ignored                                                              |
| Forged payment success                    | HMAC signature check, webhook signature check, amount and order match, no client-set status                                      |
| Account takeover by OTP guessing          | 5 attempts, 10 minute expiry, rate limits, hashed codes                                                                          |
| Account enumeration                       | Uniform responses and timing on every auth endpoint                                                                              |
| Session theft                             | httpOnly cookie, hashed tokens, revocation, rotation, Secure flag                                                                |
| Cross-site request forgery                | SameSite=Lax, an Origin header check on all state-changing requests, CORS allowlist of exact origins (never \* with credentials) |
| Cross-site scripting                      | React escaping, no dangerouslySetInnerHTML on user data, strict Content Security Policy, sanitise any rich text                  |
| SQL injection                             | Parameterised queries only; lint for template-string SQL                                                                         |
| IDOR (changing an id in the URL)          | UUIDs plus one shared ownership check; tests that vendor A cannot read vendor B for every route                                  |
| Webhook spoofing and replay               | Raw-body signature check, event-id dedup                                                                                         |
| Abuse of public endpoints (hold spamming) | Rate limits per IP and per email, cap of open holds per email, short hold time                                                   |
| Secret leakage                            | .env ignored by git, secret scanning in CI, log redaction, no secrets in NEXT_PUBLIC\_\*                                         |
| Upload abuse                              | Type sniffing, size cap, random file names, strip EXIF, serve from a separate origin                                             |
| Dependency risk                           | Lockfile, Dependabot, pnpm audit in CI                                                                                           |

## 12.5 HTTP security

- helmet defaults on the API; on the web, headers set in next.config: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy, HSTS in production.

- CSP must allow Razorpay Checkout (checkout.razorpay.com, its frames and API) and nothing else third-party except Sentry.

- The API sets trust proxy correctly for Render so rate limits see the real client IP.

- Redact authorization, cookie, set-cookie, password, OTP, token and secret fields in all logs.

## 12.6 Privacy and Indian data protection

Bayana handles personal data of Indian residents (names, emails, phone numbers, booking details), so the Digital Personal Data Protection Act, 2023 and its rules apply. Treat the following as design requirements and get a lawyer to review the policies before paid launch.

- Collect the minimum: no data field without a use.

- Tell users what you collect and why (privacy policy), and record consent with a timestamp and policy version.

- Let users access, correct and erase their data and withdraw consent; provide a grievance contact (hello@bayana.in).

- Keep financial records for the period tax law requires and anonymise personal fields when erasing.

- Report a personal data breach as the law requires; keep an incident runbook (section 17.6).

- Data location: Neon, Render and Vercel regions must be chosen deliberately. Prefer an Asia region (Mumbai or Singapore) for latency; confirm provider options when creating projects.

# 13. API specification

## 13.1 Conventions

- Base path /api/v1. JSON in and out. Dates in ISO 8601 UTC. Money as integer paise with a currency field.

- Every request has a request id (x-request-id, generated if absent) that appears in logs and error bodies.

- Validation with Zod at the edge; unknown fields are rejected, not ignored.

- Pagination: ?limit= (max 100) and ?cursor=; responses { data, nextCursor }.

- Idempotency: Idempotency-Key header on hold creation and payment-order creation.

- Success: 200, 201 on create, 204 with no body. Errors use the single shape below.

> { "error": { "code": "SLOT_TAKEN",
>
> "message": "This time was just booked. Please pick another time.",
>
> "details": {}, "requestId": "c1f6..." } }

## 13.2 Endpoint catalogue

| **Method and path**                               | **Auth**         | **Purpose**                                                              |
|---------------------------------------------------|------------------|--------------------------------------------------------------------------|
| POST /auth/otp/request                            | None             | Send OTP for a purpose (signup, login, reset); uniform response          |
| POST /auth/signup                                 | None             | Verify OTP and set password; create account and session                  |
| POST /auth/login                                  | None             | Password or OTP sign-in                                                  |
| POST /auth/password/reset                         | None             | Reset with OTP                                                           |
| POST /auth/logout                                 | Session          | Revoke current session                                                   |
| GET /auth/me                                      | Session          | Current user and vendor summary                                          |
| GET /auth/sessions, DELETE /auth/sessions/:id     | Session          | List and revoke sessions                                                 |
| GET /vendors/me, PATCH /vendors/me                | Vendor           | Profile read and update                                                  |
| POST /vendors/me/publish, /unpublish              | Vendor           | Toggle public visibility                                                 |
| GET/POST/PATCH/DELETE /services                   | Vendor           | Manage services and terms                                                |
| GET/PUT /availability/rules                       | Vendor           | Weekly windows                                                           |
| GET/POST/DELETE /availability/overrides           | Vendor           | Blocks and extra hours                                                   |
| GET /bookings, GET /bookings/:id                  | Vendor           | List and detail with events and payments                                 |
| POST /bookings/manual                             | Vendor           | Create a manual booking                                                  |
| POST /bookings/:id/cancel, /complete, /reschedule | Vendor           | Lifecycle actions                                                        |
| POST /bookings/:id/offline-payment                | Vendor           | Record offline advance or balance (audited)                              |
| GET /public/vendors/:slug                         | None             | Public profile and services (404 if unpublished)                         |
| GET /public/vendors/:slug/slots                   | None             | Slots for a service and date range                                       |
| POST /public/otp/request                          | None             | Send booking_verify OTP to the customer                                  |
| POST /public/bookings                             | OTP proof        | Create HELD booking (idempotent)                                         |
| POST /public/bookings/:id/accept-terms            | Booking token    | Freeze contract and move to PENDING                                      |
| GET /public/bookings/:id                          | Booking token    | Customer view of the booking                                             |
| POST /public/bookings/:id/cancel                  | Booking token    | Customer cancellation with refund preview first (GET .../cancel-preview) |
| POST /bookings/:id/payment-order                  | Booking token    | Create Razorpay order                                                    |
| POST /bookings/:id/payment-verify                 | Booking token    | Verify checkout signature and confirm                                    |
| POST /webhooks/razorpay                           | Signature        | Provider events (raw body)                                               |
| POST /internal/jobs/tick                          | Scheduler secret | Run due jobs (section 15.3)                                              |
| GET /health, GET /ready                           | None             | Liveness; readiness including DB                                         |
| GET /admin/\*                                     | Admin + 2FA      | Operational views and actions                                            |

## 13.3 Error codes

| **Code**                  | **HTTP** | **Meaning**                                               |
|---------------------------|----------|-----------------------------------------------------------|
| VALIDATION_FAILED         | 422      | Body, query or params failed Zod; details lists fields    |
| UNAUTHENTICATED           | 401      | No or invalid session                                     |
| FORBIDDEN                 | 403      | Authenticated but not allowed                             |
| NOT_FOUND                 | 404      | Missing or hidden resource (same for unpublished vendors) |
| RATE_LIMITED              | 429      | Too many requests; Retry-After set                        |
| OTP_INVALID               | 400      | Wrong, expired, used or locked code (single message)      |
| SLOT_TAKEN                | 409      | Overlap detected                                          |
| HOLD_EXPIRED              | 409      | Hold timer passed                                         |
| INVALID_TRANSITION        | 409      | State machine refused the change                          |
| IDEMPOTENCY_CONFLICT      | 409      | Same key, different request body                          |
| PAYMENT_DISABLED          | 503      | Payments not enabled in this environment                  |
| PAYMENT_SIGNATURE_INVALID | 400      | Checkout signature failed                                 |
| PAYMENT_MISMATCH          | 409      | Amount, currency or order mismatch                        |
| INTERNAL                  | 500      | Unexpected; logged with stack, generic message to client  |

## 13.4 Documentation of the API

Generate an OpenAPI document from the Zod schemas (for example zod-to-openapi) so the spec cannot drift from the code, serve it at /api/docs in development only, and commit the generated openapi.json on every release.

# 14. Frontend architecture

## 14.1 Structure

> apps/web/
>
> app/
>
> (marketing)/ \# /, /pricing, /about, legal pages (static)
>
> (auth)/ \# /login, /signup, /forgot
>
> \[slug\]/ \# public provider page and /book flow
>
> b/\[id\]/ \# customer booking page (token in query)
>
> dashboard/ \# vendor app (requires session)
>
> admin/ \# admin console (requires admin + 2FA)
>
> waking/ \# cold-start interstitial
>
> components/ \# ui/ (shadcn), booking/, calendar/, forms/
>
> lib/ \# api client, session helpers, formatters
>
> middleware.ts \# cheap session-cookie check for /dashboard, /admin

## 14.2 Rules

- Server Components fetch on the server; client components only for interactivity (calendar picker, forms, Checkout).

- One typed API client in lib/api.ts that adds the cookie on the server, handles the error shape, and maps error codes to human messages.

- Middleware only checks that a session cookie exists for redirect speed. The API remains the authority on every request.

- Environment: only NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RAZORPAY_KEY_ID (a public key id), and NEXT_PUBLIC_SENTRY_DSN are public. Nothing else.

- Forms: schema from @bayana/shared, inline validation as the user types, disabled submit while pending, focus the first invalid field.

- Every page has loading, empty and error states; test each at 375 px width.

- SEO: generateMetadata per provider page, canonical URLs, sitemap of published vendors, robots that excludes /dashboard, /admin, /b/.

# 15. Notifications, email and background jobs

## 15.1 Email delivery

- Provider: Brevo SMTP with SMTP_URL and EMAIL_FROM=Bayana \<hello@bayana.in\>. The Brevo free plan allows 300 emails a day; one booking can create 4 to 6 emails, so the beta supports roughly 50 to 70 bookings a day. Move to a paid Starter plan (about 9 USD a month) before that limit matters.

- Authenticate the sending domain: add Brevo's SPF include, DKIM keys and a DMARC record (p=none at first, then quarantine) to bayana.in DNS. Keep Zoho Mail's records for the mailbox; one SPF record only, with both includes merged.

- Use the outbox (section 8.2). Writing to it happens in the business transaction; a worker step in the tick sends with retry and backoff (1, 5, 30, 120 minutes, then failed).

- OTP and payment emails have priority 0; reminders priority 5.

- Every email has a plain-text part, a clear subject, the vendor name as the visible sender name where possible, and no tracking pixels in v1.

## 15.2 Email templates (v1)

| **Template**               | **To**           | **Content**                                                          |
|----------------------------|------------------|----------------------------------------------------------------------|
| otp                        | User or customer | Six-digit code, purpose, 10-minute expiry, ignore if not you         |
| hold_started               | Customer         | Slot, price, advance, deadline to pay                                |
| booking_confirmed_customer | Customer         | Details, contract link, receipt, calendar file, cancellation summary |
| booking_confirmed_vendor   | Vendor           | Who, when, advance paid, balance due                                 |
| booking_cancelled          | Both             | Who cancelled, reason, refund amount and timing                      |
| refund_issued              | Customer         | Amount and expected days                                             |
| reminder_24h               | Both             | Time, place or link, balance due                                     |
| payment_review             | Admin            | Mismatch or failed refund needing attention                          |

## 15.3 Background jobs on a free host

The free Render plan sleeps after 15 minutes and has no cron or workers. Jobs therefore run when something calls the API. A GitHub Actions workflow calls POST /internal/jobs/tick with a secret header on a schedule. GitHub's scheduler is best-effort and may drift or skip runs, so every job must be safe to run late and safe to run twice.

| **Job**            | **Frequency** | **What it does**                                                         |
|--------------------|---------------|--------------------------------------------------------------------------|
| expire_holds       | Every tick    | Move overdue HELD and PENDING to EXPIRED via transitionBooking           |
| send_outbox        | Every tick    | Send queued emails with retry and backoff                                |
| send_reminders     | Every tick    | Queue 24-hour reminders once (guard column reminder_sent_at)             |
| reconcile_payments | Nightly       | Compare Razorpay with the ledger                                         |
| cleanup            | Nightly       | Delete expired OTP rows, sessions and old webhook payloads per retention |
| consistency_check  | Nightly       | Run integrity queries (section 17.4) and alert                           |

> **Honest limit** A tick every 5 to 10 minutes means email can be up to 10 minutes late and a wake-up costs about a minute. That is acceptable for a beta. Do not ping the API every 10 minutes to keep it awake: Render staff say this goes against the free tier's intent, and it would also burn the 750 free instance hours (a month has about 744 hours, so one always-awake service uses nearly all of them). The right fix is the paid plan (about 7 USD a month) once real customers depend on it.

## 15.4 In-app notifications

P2: a bell icon in the vendor dashboard fed by booking_events, with unread counts. Not needed for v1 because email covers it.

# 16. Environments and deployment

## 16.1 Three environments

| **Environment** | **Web**                    | **API**                        | **Database**                                   | **Payments**                   | **Purpose**                              |
|-----------------|----------------------------|--------------------------------|------------------------------------------------|--------------------------------|------------------------------------------|
| Local           | localhost:3000             | localhost:4000                 | Docker Postgres 16, bayana_dev and bayana_test | disabled or test               | Daily development                        |
| Staging         | staging.bayana.in (Vercel) | api-staging.bayana.in (Render) | Neon branch or separate project                | test                           | Full rehearsal with real DNS and cookies |
| Production      | bayana.in (Vercel)         | api.bayana.in (Render)         | Neon production project                        | disabled then live after gates | Real users                               |

## 16.2 Local setup (Windows, PowerShell)

1.  Install Node 22 LTS, pnpm (via Corepack), Git, Docker Desktop and VS Code. Keep the repo outside OneDrive (for example C:\dev\bayana).

2.  Start the database: docker compose up -d db. Create bayana_dev and bayana_test (a one-time init script in docker/initdb).

3.  Copy .env.example to .env in apps/api and apps/web; fill values (Appendix A). Never commit .env.

4.  Install and migrate: pnpm.cmd install, then pnpm.cmd db:migrate, then pnpm.cmd db:seed (development only).

5.  Run everything: pnpm.cmd dev (web on 3000, API on 4000).

6.  Mail in development: either a local Mailpit container (preferred, nothing leaves your machine) or Brevo with your own address.

7.  Razorpay in development: PAYMENT_MODE=test with test keys; use the Razorpay CLI or a tunnel (for example Cloudflare Tunnel) to receive webhooks locally.

8.  Before every commit run pnpm.cmd typecheck, pnpm.cmd lint, pnpm.cmd test, pnpm.cmd build.

## 16.3 Services to create (accounts checklist)

| **Service**                 | **Used for**             | **Plan to start**                           | **Notes**                                                                                                        |
|-----------------------------|--------------------------|---------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| GitHub                      | Code, CI, scheduler      | Free                                        | Private repository; enable Dependabot and secret scanning                                                        |
| Vercel                      | Web hosting              | Hobby for staging and personal testing only | Hobby is non-commercial; production that earns money needs Pro (about 20 USD per user per month) or another host |
| Render                      | API hosting              | Free web service                            | Sleeps after 15 min idle, about 1 minute to wake, 750 free hours a month, no disk, no workers, no cron           |
| Neon                        | PostgreSQL               | Free                                        | About 0.5 GB per project, scale to zero after 5 min idle, limited compute hours                                  |
| Brevo                       | Transactional email      | Free                                        | 300 emails a day; verify domain with SPF, DKIM, DMARC                                                            |
| Zoho Mail                   | Mailbox hello@bayana.in  | Free or lite                                | Already in use                                                                                                   |
| Razorpay                    | Payments                 | Test mode                                   | Live needs business KYC; confirm Route availability (D1)                                                         |
| Cloudflare                  | DNS, optional R2 storage | Free                                        | DNS for bayana.in plus records for Vercel, Render, Brevo, Zoho                                                   |
| Sentry                      | Error tracking           | Free developer plan                         | Strip personal data before send                                                                                  |
| UptimeRobot or Better Stack | Uptime checks on /health | Free                                        | Check every 5 min only if you accept the keep-awake caveat in 15.3; otherwise check the web app only             |
| Domain registrar            | bayana.in                | Paid yearly                                 | Enable auto-renew and lock                                                                                       |

## 16.4 Environment variable matrix

Full list in Appendix A. Rule: names live in .env.example; values live only in the host dashboards and your password manager. The API validates all variables with Zod at startup and exits with a clear message if any are missing.

## 16.5 Deployment procedure (first time)

1.  **Neon:** create the project in an Asia region. Copy two connection strings: **pooled** (host contains -pooler) for the API runtime and **direct** for migrations. Run CREATE EXTENSION btree_gist; once and confirm it succeeds.

2.  **Migrations:** from your laptop or CI run pnpm.cmd db:migrate with DATABASE_URL_DIRECT. Never run migrations from the API process.

3.  **Render:** new Web Service from the GitHub repo, root apps/api, build pnpm install --frozen-lockfile && pnpm build, start node dist/server.js, health check path /health. Add env vars. Set NODE_ENV=production, TRUST_PROXY=1.

4.  **Custom domain on Render:** add api.bayana.in, then the CNAME it shows in Cloudflare DNS (DNS only, grey cloud, until the certificate issues).

5.  **Vercel:** import the repo, root apps/web, framework Next.js. Add env vars. Add domain bayana.in and www redirect.

6.  **DNS:** add Brevo SPF/DKIM/DMARC records, keep Zoho MX records, merge SPF into one record.

7.  **GitHub Actions:** add the secrets API_URL and TICK_SECRET; enable the tick workflow.

8.  **Razorpay:** create a test webhook pointing at https://api-staging.bayana.in/api/v1/webhooks/razorpay with the events payment.captured, payment.failed, order.paid, refund.processed; store the secret.

9.  **Smoke test:** run the staging checklist in 16.7.

## 16.6 Cold start handling

The first request after 15 minutes of idle waits roughly a minute for Render to wake the API, and Neon may need a second or two to resume. Design for it instead of hiding it:

- The web app's API client uses a 10-second timeout on the first call. On timeout or a 502/503 it routes to /waking, which shows a friendly message and retries /health every 3 seconds, then returns the user to where they were.

- Public provider pages are server-rendered with Incremental Static Regeneration so the profile loads from Vercel's cache even while the API sleeps; only booking actions need the API.

- Webhooks and ticks that arrive while asleep wake the service; Razorpay retries make this safe.

- On boot the API runs a short reconcile and logs boot_complete.

- State this limit plainly to beta vendors. For a real launch, move the API to an always-on instance (decision gate in 16.8).

## 16.7 Staging go-live checklist

| **\#** | **Check**                                                    | **Pass when**                                             |
|--------|--------------------------------------------------------------|-----------------------------------------------------------|
| 1      | /health and /ready respond on api-staging                    | Both 200; /ready proves the DB works                      |
| 2      | Signup, logout, password login, OTP login for the same email | All four work; a returning user is never locked out       |
| 3      | Cookies cross from staging to api-staging                    | Session survives reload and server-component fetch        |
| 4      | Full booking with test payment                               | HELD, PENDING, CONFIRMED, emails received, ledger correct |
| 5      | Double-click and two-browser race on one slot                | Exactly one booking                                       |
| 6      | Close the tab after paying                                   | Webhook confirms the booking                              |
| 7      | Let the hold expire, then pay late                           | Re-claim or refund path works                             |
| 8      | Wait 20 minutes idle, then open a page                       | /waking shows then recovers                               |
| 9      | Replay a webhook                                             | No duplicate effect                                       |
| 10     | Tick workflow ran in the last 30 minutes                     | Admin health is green                                     |
| 11     | Email passes SPF, DKIM, DMARC in a mail-tester check         | All pass                                                  |
| 12     | No secret in repo, bundle or logs                            | Secret scan and log review clean                          |

## 16.8 Cost gates: what must change before the first live rupee

| **Gate**                 | **Why**                                                                      | **Action**                                                                                                         | **Approx cost**                    |
|--------------------------|------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|------------------------------------|
| Commercial hosting terms | Vercel Hobby is for non-commercial use                                       | Move web to Vercel Pro, or host it on Render or another host that allows commercial use                            | About 20 USD a month for Pro       |
| Always-on API            | Free API sleeps and may restart; real payments and webhooks need reliability | Render paid web service or equivalent                                                                              | About 7 USD a month and up         |
| Database safety          | Free Neon has limited history and size                                       | Paid Neon plan with point-in-time restore, plus your own scheduled pg_dump to storage you control; prove a restore | Plan-dependent; check Neon pricing |
| Email volume             | 300 a day cap                                                                | Brevo Starter                                                                                                      | About 9 USD a month                |
| Payments live            | KYC, settlement account, Route decision                                      | Complete Razorpay live activation                                                                                  | Per-transaction fees               |
| Legal pages              | Policies must be accurate                                                    | Lawyer reviews terms, privacy, refunds                                                                             | One-time                           |
| Monitoring               | Someone must know when it breaks                                             | Sentry alerts and uptime checks to phone or email                                                                  | Free to low                        |

> **Rule** Do not switch PAYMENT_MODE to live until every gate above is done and the restore drill in section 17.3 has passed. Until then, use test mode or offline advance recording.

## 16.9 When to leave the free tiers

| **Trigger**                                                | **Move**                                                                                                                                                               |
|------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| First paying vendor, or any live payment                   | Complete all gates in 16.8                                                                                                                                             |
| More than about 20 active vendors or 200 bookings a month  | Paid API, paid DB, paid email                                                                                                                                          |
| Tick latency or cold starts hurt conversion                | Always-on API and a real scheduler                                                                                                                                     |
| Email over 250 a day on average                            | Higher email plan, consider a dedicated sender                                                                                                                         |
| Revenue covers a small VPS or managed platform comfortably | Consider Fly.io, Railway, a VPS with Docker, or a managed cloud region in Mumbai. Keep the app container-friendly (a Dockerfile for the API from the start of phase 7) |

## 16.10 CI/CD

- **On every pull request:** install, typecheck, lint, unit tests, integration tests against a Postgres service container, build web and API, secret scan.

- **On merge to \`main\`:** migrations run against staging (direct URL) from a protected workflow, then Render and Vercel deploy automatically from the branch. Production migrations run from a manual workflow with approval, before the production deploy.

- **Scheduler workflow:** cron: '\*/10 \* \* \* \*' calling curl -fsS -X POST -H "x-tick-secret: \$TICK_SECRET" \$API_URL/api/v1/internal/jobs/tick. A second nightly workflow calls the nightly jobs.

- **Branches:** main is always deployable; work on phase-\<n\>-\<name\> branches and merge by pull request, even solo.

# 17. Observability, backups and runbooks

## 17.1 Logging

- Pino JSON logs with request id, route, status, duration, user id (never email), vendor id and booking id.

- Log every booking transition, payment event, webhook, auth failure, rate-limit hit and job run.

- Render keeps logs briefly on the free plan; ship errors to Sentry and keep job_runs and booking_events in the database as the durable record.

## 17.2 Alerts and health

| **Signal**             | **Threshold**                               | **Action**                                           |
|------------------------|---------------------------------------------|------------------------------------------------------|
| Error rate in Sentry   | Any new issue                               | Email the founder                                    |
| Last successful tick   | Older than 30 minutes                       | Admin health red; email                              |
| Email outbox backlog   | More than 20 items older than 15 minutes    | Investigate Brevo, daily cap or SMTP URL             |
| Webhooks received      | None for 24 hours while payments are active | Check Razorpay webhook status; re-enable if disabled |
| Payment mismatch flags | Any                                         | Review in admin the same day                         |
| Database size          | Over 70 percent of plan                     | Prune or upgrade                                     |

## 17.3 Backups and restore drill

- Free Neon gives little history, so take your own logical backups: a nightly GitHub Actions job runs pg_dump against the direct URL, encrypts the file, and uploads it to storage you control (for example Cloudflare R2). Keep 7 daily and 4 weekly copies.

- **Restore drill:** before M3 and then every quarter, restore the latest dump into an empty Neon branch or local Docker database and run the consistency queries. A backup that has never been restored is not a backup.

- Back up the secrets list separately in a password manager (names and where each value lives).

## 17.4 Consistency queries (nightly)

> -- confirmed bookings without a verified payment or offline record
>
> SELECT b.id FROM bookings b
>
> WHERE b.status IN ('confirmed','completed')
>
> AND NOT EXISTS (SELECT 1 FROM payments p
>
> WHERE p.booking_id = b.id AND p.status = 'captured');
>
> -- holds past expiry still marked active
>
> SELECT id FROM bookings WHERE status IN ('held','pending') AND hold_expires_at \< now() - interval '1 hour';
>
> -- bookings with no events (history gap)
>
> SELECT b.id FROM bookings b LEFT JOIN booking_events e ON e.booking_id = b.id WHERE e.id IS NULL;

## 17.5 Runbooks

| **Incident**                            | **Steps**                                                                                                                                                                           |
|-----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer paid but booking not confirmed | 1\) Open booking in admin. 2) Check payments and webhook_events. 3) Use Re-verify against Razorpay. 4) If captured, confirm through admin (audited); if slot lost, refund and email |
| Double booking reported                 | Should be impossible. Query overlapping rows; check the constraint exists (\d bookings); treat as a P0 defect and write a regression test                                           |
| Emails not arriving                     | Check outbox statuses, Brevo daily count and logs, SPF/DKIM/DMARC, spam folder; retry from admin                                                                                    |
| API down or restarting                  | Check Render events, /health, Sentry; redeploy last good commit; confirm webhooks resume                                                                                            |
| Webhook disabled by Razorpay            | Re-enable in the dashboard, then run reconcile for the outage window                                                                                                                |
| Suspected account compromise            | Revoke all sessions for the user, force password reset, review audit log                                                                                                            |
| Data breach suspected                   | Contain, preserve logs, assess what data, notify as the law and policy require, record in an incident file                                                                          |

## 17.6 Data retention

| **Data**                                       | **Keep**                                                                                  |
|------------------------------------------------|-------------------------------------------------------------------------------------------|
| OTP codes                                      | Delete after 1 day                                                                        |
| Sessions                                       | Delete 30 days after expiry or revoke                                                     |
| Webhook payloads                               | Keep summary indefinitely, full payload 90 days                                           |
| Email outbox bodies                            | 90 days                                                                                   |
| Bookings, payments, refunds, contracts, events | Per tax and legal guidance, typically several years; anonymise personal fields on erasure |
| Application logs                               | As the host allows; Sentry 30 to 90 days                                                  |

# 18. Testing strategy

| **Layer**        | **Tool**                                                  | **What it proves**                                                                      | **Gate**                    |
|------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------------|-----------------------------|
| Unit             | Vitest                                                    | Slot engine, advance and refund math, OTP logic, state machine table, signature helpers | Run on every commit         |
| Integration      | Vitest + Supertest + real Postgres (\_test DB)            | Routes, constraints, transactions, webhooks, ownership checks                           | Every PR                    |
| Concurrency      | Vitest with Promise.allSettled                            | One winner among 20 simultaneous bookings; block vs book race                           | Every PR, repeated 10 times |
| Contract and API | Generated OpenAPI plus schema tests                       | Responses match documented shapes                                                       | Every PR                    |
| End to end       | Playwright (mobile and desktop)                           | Signup, onboarding, booking with test payment, cancellation, /waking                    | Before each deploy          |
| Security         | Custom IDOR tests, pnpm audit, secret scan, header checks | Vendor A cannot touch vendor B; no leaked secrets                                       | Every PR                    |
| Accessibility    | axe in Playwright                                         | No serious violations on key pages                                                      | Before launch               |
| Performance      | Lighthouse CI on the public page                          | LCP under 2.5 s on throttled mobile                                                     | Before launch               |

## 18.1 Mandatory test list

- Auth: OTP expiry, attempts, reuse, wrong purpose; enumeration uniformity; returning vendor can log in by password and by OTP.

- Booking: overlap, buffers, idempotency, hold expiry, snapshot immutability, every state transition allowed and every illegal one refused.

- Payments: bad signature, tampered amount, duplicate webhook, late payment both branches, refund amount equals preview.

- Privacy: unpublished equals nonexistent; no owner email in public JSON; booking page needs token.

- Tooling guard: the test runner refuses to start unless the database name ends in \_test.

## 18.2 Definition of done (every phase)

- Requirements listed for the phase pass their acceptance tests.

- typecheck, lint, test, build exit with code 0.

- No console.log, no any, no skipped tests, no secrets.

- A new entry appended to docs/PROGRESS.md; docs touched only as the phase says.

- Branch committed with a clear message; nothing destructive was done to the database.

# 19. Build plan for Claude Code

## 19.1 How to work with Claude Code

- Put AGENTS.md (rules) in the repo root and create a short CLAUDE.md (under about 200 lines) that imports it with @AGENTS.md and adds Claude-specific notes (Appendix D). Run /init once, then trim.

- One phase per session. Start with plan mode: ask for a plan of at most 10 lines, read it, approve, then let it code.

- Give each session only: the phase name, the requirement IDs, and the sections to read. Do not paste this whole document.

- Commit at the end of each phase on a branch. Use /context when a session feels slow and start a fresh session instead of dragging a long one.

- Keep docs/PROGRESS.md updated so a new session can resume cheaply.

- Run the real commands. Never accept "implemented" without test output and exit codes.

## 19.2 Phases

| **Phase**                        | **Goal**                                                                                                                     | **Requirements**              | **Sections to read** | **Gate**                                                    |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------|-------------------------------|----------------------|-------------------------------------------------------------|
| 0 Audit and baseline             | Understand the existing repo, reproduce the sign-in bug, list defects, no feature work                                       | AU-02 (reproduce)             | 0.2, 12              | Audit file written; bug reproduced with exact error         |
| 1 Foundation                     | Config validation, logger, error handler, DB helper, migration runner with checksums, test DB guard, CI skeleton, Dockerfile | NF items, section 8.5         | 6, 7, 8, 18          | Clean install, migrate, test on a fresh clone               |
| 2 Auth                           | Users, sessions, OTP, password, signup, login by password or OTP, reset, rate limits                                         | AU-01 to AU-09                | 12, 13               | Returning vendor can always sign in; enumeration tests pass |
| 3 Vendor and services            | Onboarding, slug, publish, services, terms template, cancellation tiers, availability rules and overrides                    | VN, SV, AV-01 to AV-03, CT-01 | 4.2, 4.3, 9          | Vendor can publish a bookable page                          |
| 4 Booking engine                 | Slot engine, holds, exclusion constraint, idempotency, transitionBooking, expiry, concurrency tests                          | AV-04, BK-01 to BK-08         | 8.3, 9, 10           | 20-way race has one winner, 10 runs in a row                |
| 5 Public pages and customer flow | Public page, booking flow, OTP for customers, terms acceptance, customer booking page, /waking                               | PB, CT-02, CT-03, BK-02       | 5, 14, 16.6          | Full booking works end to end with payments disabled        |
| 6 Payments                       | Payment modes, orders, verify, webhooks, dedup, late payment, offline advance, refunds, reconcile, receipts                  | PY-01 to PY-11, CT-04         | 11                   | Test-mode booking confirms by browser and by webhook alone  |
| 7 Notifications and jobs         | Email outbox, templates, tick endpoint, reminders, nightly jobs, GitHub Actions schedule                                     | NT-01 to NT-04                | 15                   | Emails survive SMTP outage; jobs idempotent                 |
| 8 Dashboard and admin            | Vendor calendar, bookings, payments, customers, settings; admin console, audit                                               | BK-09 to BK-13, AD, AU-10     | 5.3, 5.4             | Founder can diagnose a stuck booking without SQL            |
| 9 Hardening                      | Security headers, CSP, IDOR suite, accessibility, performance, privacy export and delete, legal pages                        | PV, NF                        | 12, 18               | Section 18 gates pass                                       |
| 10 Deploy to staging             | Neon, Render, Vercel, DNS, Actions, Sentry, backups, checklist 16.7                                                          | Deployment                    | 16, 17               | Checklist 16.7 all pass                                     |
| 11 Beta and launch gates         | Real vendors on test or offline mode; clear cost gates; restore drill; go-live decision                                      | M2, M3                        | 16.8, 20, 21         | Gates in 16.8 cleared before live payments                  |

## 19.3 Mapping to the earlier Codex phases

The earlier CODEX_PHASES.md prompts remain valid. Roughly: Codex phases 0 to 2 map to phases 0 to 2 here; Codex booking and payment phases map to 4 and 6; Codex UI, hardening and deployment phases map to 8, 9 and 10. Where the two disagree, this specification wins.

## 19.4 Starter prompt for each Claude Code session

> Read AGENTS.md and CLAUDE.md. Today's task is PHASE \<n\> from docs/SPEC.md section 19.
>
> Requirements: \<IDs\>. Read only sections: \<list\>.
>
> Use plan mode: give me a plan of 10 lines or fewer and wait.
>
> After approval: work on branch phase-\<n\>-\<name\>, write tests first for each invariant,
>
> run typecheck, lint, test and build, append to docs/PROGRESS.md, and stop at the phase gate.
>
> Report PASS, FAIL, BLOCKED or NOT TESTED per requirement, with exit codes.

## 19.5 Estimated effort (solo, with Claude Code)

| **Phases** | **Rough duration** | **Notes**                                                      |
|------------|--------------------|----------------------------------------------------------------|
| 0 to 2     | 2 to 3 weeks       | Foundation and auth are where most past bugs live; do not rush |
| 3 to 5     | 3 to 4 weeks       | Booking correctness is the heart; test heavily                 |
| 6 to 7     | 2 to 3 weeks       | Razorpay test mode, webhooks and jobs                          |
| 8 to 9     | 3 weeks            | Dashboard polish and hardening                                 |
| 10 to 11   | 2 weeks            | Deploy, rehearse, onboard first vendors                        |

These are estimates for planning, not promises. Real time depends on how much you review rather than accept.

# 20. Business and SaaS operations

## 20.1 Pricing hypothesis

| **Plan**       | **Price (INR per month, hypothesis)** | **Includes**                                                                                 |
|----------------|---------------------------------------|----------------------------------------------------------------------------------------------|
| Free           | 0                                     | 1 service, up to 5 online bookings a month, Bayana branding, platform fee on online advances |
| Pro            | 499 to 799                            | Unlimited services and bookings, custom terms, reminders, calendar feed, lower platform fee  |
| Studio (later) | 1,499 and up                          | Multiple staff, team calendar, exports, priority support                                     |

Treat these as hypotheses to test with your first ten vendors, not final prices. A platform fee on online advances (for example 1 to 2 percent on top of gateway charges) aligns Bayana with vendor revenue; decide it together with the payout model in 11.6.

## 20.2 Metrics to track from day one

| **Metric**                                       | **Why**                             |
|--------------------------------------------------|-------------------------------------|
| Vendors signed up, published, with first booking | Activation funnel                   |
| Booking page visits to holds to confirmed        | Conversion and where customers drop |
| Hold expiry rate                                 | Friction at payment                 |
| Online advance volume (GMV) and platform fees    | Revenue                             |
| Refund and dispute rate                          | Policy quality and trust            |
| Time to first booking after signup               | Onboarding quality                  |
| Weekly active vendors and 8-week retention       | Product value                       |
| Support tickets per 100 bookings                 | Hidden defects                      |

## 20.3 Legal and compliance checklist

- Business registration and a current bank account for the company or proprietorship that will receive money.

- Razorpay live activation documents. GST registration and invoicing as your CA advises.

- Terms of service, privacy policy (DPDP aligned), refund and cancellation policy, vendor agreement, written and reviewed by a lawyer.

- Grievance contact and response process; cookie notice if you add analytics.

- Trademark search for the name Bayana and class filing when revenue justifies it.

## 20.4 Support model

Solo support from hello@bayana.in with a published response target (for example one business day). The admin console exists so that most issues are solved from one screen. Write short help-centre articles for the five most common questions as soon as you see them twice.

## 20.5 Go-to-market (beta)

- Start with wedding and event photographers and makeup artists in Delhi NCR: high advances, clear pain, active on Instagram.

- Offer setup help in person or by call; ask each vendor to put the link in their bio and in one real conversation.

- Keep a founder-visible log of every confusing moment in the first 20 bookings.

# 21. Risks and mitigations

| **Risk**                                           | **Likelihood** | **Impact** | **Mitigation**                                                                                   |
|----------------------------------------------------|----------------|------------|--------------------------------------------------------------------------------------------------|
| Free-tier cold start makes bookings feel broken    | High           | Medium     | ISR for public pages, /waking flow, honest beta messaging, move to paid API before live payments |
| Free Neon storage, compute or history limits hit   | Medium         | High       | Own backups, size monitoring, paid plan at the cost gate                                         |
| Razorpay webhook disabled after a long outage      | Low            | High       | Alert on silence, reconcile job, boot reconcile                                                  |
| Double booking from a logic bug                    | Low            | Critical   | DB constraint, advisory lock, concurrency tests, nightly overlap query                           |
| Account lockout bugs (the earlier sign-in problem) | Medium         | High       | Phase 2 tests for every sign-in path; never infer account state from OTP verification alone      |
| Payment compliance or payout model blocks launch   | Medium         | High       | Ask Razorpay early (D1); launch beta with offline advance                                        |
| Email limit or deliverability trouble              | Medium         | Medium     | SPF, DKIM, DMARC, outbox with priority, upgrade path                                             |
| Scope creep (marketplace, multi-staff, apps)       | High           | High       | Section 2.2 is the fence; changes need a written decision                                        |
| Solo founder burnout or review fatigue             | Medium         | High       | One phase at a time, tests as the safety net, weekly demo to a friend                            |
| Vercel Hobby terms violated by commercial use      | Medium         | Medium     | Treat staging as non-commercial; upgrade at the gate                                             |
| Legal exposure from weak contract wording          | Medium         | Medium     | Lawyer review; say clearly it is click-wrap, not a licensed e-signature                          |
| Vendors do not adopt (market risk)                 | Medium         | High       | Validate with 10 vendors before heavy polish; measure activation                                 |

# 22. Open decisions

| **ID** | **Decision**                   | **Options**                                           | **Recommendation**                                                                      | **Needed by**              |
|--------|--------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------|----------------------------|
| D1     | Payout model                   | A platform collects (Route) or B vendor-owned gateway | Ask Razorpay what your account supports; default to B if Route is not quickly available | Before phase 6 payout work |
| D2     | Platform fee                   | Subscription only, fee only, or both                  | Subscription plus small fee on online advances                                          | Before M3                  |
| D3     | Hold duration                  | 10, 15 or 30 minutes                                  | 15 minutes                                                                              | Phase 4                    |
| D4     | Slot step                      | Equal to duration or fixed (15, 30)                   | Configurable per service, default 30                                                    | Phase 3                    |
| D5     | Image storage                  | Cloudflare R2, Vercel Blob, or none in beta           | R2 (cheap, no egress fees); skip galleries in beta if short on time                     | Phase 8                    |
| D6     | Contract legal review          | DIY template or lawyer                                | Lawyer before M3                                                                        | Before M3                  |
| D7     | GST registration timing        | Now or at threshold                                   | CA decision                                                                             | Before M3                  |
| D8     | Customer cancellation defaults | Strict, moderate, flexible                            | Provide three presets; vendor chooses                                                   | Phase 3                    |
| D9     | Admin second factor            | TOTP app or email OTP plus allowlist                  | TOTP                                                                                    | Phase 8                    |
| D10    | Analytics                      | None, Plausible, PostHog                              | Plausible or none in beta (no cookie banner needed)                                     | Phase 9                    |

# Appendix A. Environment variables

| **Variable**                | **App**      | **Secret?**    | **Example or note**                                 |
|-----------------------------|--------------|----------------|-----------------------------------------------------|
| NODE_ENV                    | API, web     | No             | development, test, production                       |
| PORT                        | API          | No             | 4000 locally; Render sets its own                   |
| APP_ENV                     | API          | No             | local, staging, production                          |
| DATABASE_URL                | API          | Yes            | Neon pooled URL (runtime)                           |
| DATABASE_URL_DIRECT         | Migrations   | Yes            | Neon direct URL                                     |
| DATABASE_URL_TEST           | Tests        | No             | Must end in \_test                                  |
| SESSION_COOKIE_DOMAIN       | API          | No             | .bayana.in in staging and production; empty locally |
| WEB_ORIGINS                 | API          | No             | Comma list of exact allowed origins                 |
| OTP_PEPPER                  | API          | Yes            | 32+ random bytes                                    |
| SESSION_SECRET              | API          | Yes            | 32+ random bytes for any signed values              |
| SMTP_URL                    | API          | Yes            | Brevo SMTP URL                                      |
| EMAIL_FROM                  | API          | No             | Bayana \<hello@bayana.in\>                          |
| PAYMENT_MODE                | API          | No             | disabled (default), test, live                      |
| RAZORPAY_KEY_ID             | API          | No (public id) | rzp_test\_...                                       |
| RAZORPAY_KEY_SECRET         | API          | Yes            | Never in web                                        |
| RAZORPAY_WEBHOOK_SECRET     | API          | Yes            | From webhook setup                                  |
| LIVE_PAYMENTS_ACK           | API          | No             | yes only in production when live                    |
| TICK_SECRET                 | API, Actions | Yes            | Header value for /internal/jobs/tick                |
| TRUST_PROXY                 | API          | No             | 1 on Render                                         |
| SENTRY_DSN                  | API, web     | No             | Strip personal data                                 |
| NEXT_PUBLIC_API_URL         | Web          | No             | http://localhost:4000 locally                       |
| NEXT_PUBLIC_SITE_URL        | Web          | No             | http://localhost:3000 locally                       |
| NEXT_PUBLIC_RAZORPAY_KEY_ID | Web          | No             | Public key id only                                  |

# Appendix B. Repository layout

> bayana/
>
> apps/
>
> api/
>
> sql/ \# 001\_... forward-only migrations
>
> src/
>
> config/ \# Zod-validated env
>
> db/ \# pool, tx helper, migrate runner
>
> modules/ \# auth, vendors, services, availability, bookings,
>
> \# payments, webhooks, notifications, admin, jobs
>
> middleware/ \# requestId, auth, ownership, rateLimit, error
>
> lib/ \# logger, time, money, crypto, otp
>
> server.ts
>
> test/
>
> web/ \# Next.js app (section 14.1)
>
> packages/
>
> shared/ \# Zod schemas, types, error codes, money helpers
>
> docs/ \# SPEC.md, PROGRESS.md, ARCHITECTURE.md, openapi.json
>
> docker/ \# compose file, initdb scripts
>
> .github/workflows/ \# ci.yml, tick.yml, nightly.yml, backup.yml
>
> AGENTS.md CLAUDE.md .env.example README.md

# Appendix C. Money and time rules

- Advance for a percentage rule: advance = floor((price \* pct + 50) / 100), which is round half up in integer math; then advance = min(advance, price).

- Refund math is a pure function in packages/shared with tests; the same function renders the preview and issues the refund.

- Display with Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }) after dividing paise by 100 for display only.

- Store UTC; convert to the vendor timezone for display and for local-date reasoning; label times with the zone when the customer's zone differs.

# Appendix D. CLAUDE.md template

> \# Bayana
>
> @AGENTS.md
>
> \## Commands (Windows PowerShell; use pnpm.cmd)
>
> \- pnpm.cmd dev \| typecheck \| lint \| test \| build \| db:migrate \| db:seed
>
> \## Where things are
>
> \- Spec: docs/SPEC.md (read only the sections named in the task)
>
> \- Migrations: apps/api/sql (forward-only, next free number)
>
> \- Shared schemas: packages/shared
>
> \## Working agreements
>
> \- Plan mode first; plan is 10 lines or fewer.
>
> \- One phase per session; stop at its gate.
>
> \- Only transitionBooking changes booking status.
>
> \- Never enable PAYMENT_MODE=live. Never touch non-test databases destructively.
>
> \- Append to docs/PROGRESS.md before finishing.

# Appendix E. Glossary

| **Term**   | **Meaning**                                                              |
|------------|--------------------------------------------------------------------------|
| Advance    | Part of the price paid online to lock the booking                        |
| Balance    | Price minus amount paid                                                  |
| Hold       | Temporary reservation of a slot while the customer completes payment     |
| Slot       | A bookable start time for a service                                      |
| Buffer     | Setup or cleanup time before or after a booking that nobody else may use |
| Snapshot   | Copy of price, terms and advance rule frozen onto a booking              |
| Outbox     | Database table of emails waiting to be sent                              |
| Tick       | A scheduled call that runs due background jobs                           |
| Paise      | One hundredth of a rupee; the stored money unit                          |
| Click-wrap | Agreement accepted by ticking a box next to the visible text             |

# Appendix F. Free-tier limits (checked 2026, re-check before relying)

| **Service**             | **Limit that matters**                                                                                                        | **Impact on Bayana**                                   |
|-------------------------|-------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|
| Render free web service | Sleeps after 15 min idle; about 1 min wake; 750 instance hours per month; no persistent disk; no workers or cron; may restart | Cold starts, external scheduler, no local file storage |
| Vercel Hobby            | Non-commercial use only                                                                                                       | Fine for staging; upgrade before earning               |
| Neon free               | About 0.5 GB per project; limited compute hours; scales to zero after 5 min idle; short history                               | Small beta only; own backups                           |
| Brevo free              | 300 emails per day                                                                                                            | About 50 to 70 bookings a day at most                  |
| Razorpay webhooks       | Retries with exponential backoff for 24 hours, then disabled; at least once                                                   | Idempotency and reconcile are mandatory                |
| GitHub Actions schedule | Best-effort timing; may delay or skip                                                                                         | Jobs safe to run late or twice                         |

Vendors change these terms. The check date for this table is October 2026; confirm on each provider's pricing page before the staging and launch milestones.
