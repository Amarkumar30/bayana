# Bayana UX flow map (Phase 1: analysis)

Branch `ux-redesign` from `hosting-ready` at 38f0804. No product code was changed in Phase 1.

**How this was measured.** A Playwright audit was run at 375 × 812 (touch, en-IN, Asia/Kolkata) against the real API on `bayana_test`, with real emails in Mailpit:
- Two passes: `PAYMENT_MODE=disabled`, and `PAYMENT_MODE=test` with FakeProvider (Checkout stubbed in the browser, no keys).
- 10 journeys, 83 screens. Every journey passed. For each screen the audit recorded taps, typed fields, waits, words in `<main>`, headings, notices and horizontal overflow, and saved a full-page screenshot.
- Where the audit script and screenshots live (outside git):
  - Script: `apps/web/test-results/ux-audit/` (git-ignored).
  - Screenshots: the session scratchpad, `ux-before/<flow>/NN-<screen>.png`, plus one `<flow>.json` per flow.
- Waits were measured against `next dev` on a laptop, so treat them as relative, not production numbers.
- **Not measured live:** Google sign-in, because a real Google round trip can't run locally. Those steps come from the code (`booking-flow.tsx` `returnFromGoogle`) and the mocked `e2e/google.spec.ts`.

Words used below: a *tap* is one click or press, a *field* is one typed input, and a *screen* is a distinct view the person has to read.

---

## 1. Journeys as they are today

### 1a. Vendor

| # | Screen | Person does | API | DB change | Email |
|---|---|---|---|---|---|
| V1 | `/signup` | email, "Email me a code" (or Google) | `POST /v1/auth/otp/request` (signup) | `otp_codes` row | "Your Bayana code" |
| V2 | `/signup`, step 2 | code, "Create account" | `POST /v1/auth/signup` | `users` (VENDOR), session, consent | none |
| V3 | `/onboarding` 1/4 "Tell clients who you are" | business name, link (auto), category, city, timezone, description (marked optional) | `POST /v1/vendor/me` | `vendors` row | none |
| V4 | 2/4 "Add your first service" | name, per session or per day, price, length, min/max sessions, advance | `POST /v1/vendor/services` | `services` row | none |
| V5 | 3/4 "When do you take bookings?" | weekdays, from/to | `PUT /v1/vendor/availability/rules` | availability rules | none |
| V6 | 4/4 "Your terms, then publish" | description, booking terms, cancellation, rescheduling (4 empty textareas) | `PATCH /v1/vendor/me`, `POST /v1/vendor/publish` | `vendors.published` | none |
| V7 | "Your page is live" | View page / Go to dashboard | none | none | none |
| V8 | `/dashboard` | checklist (until done), money cards, Today, Next 7 days, To do, public link (Preview, Copy) | `GET /v1/vendor/me`, `/checklist`, `/overview` | none | none |
| V9 | receive a booking | none | none | the customer's hold, then PENDING | "New booking request: <name>, <service>" (online: "Booking confirmed: …") |
| V10 | `/dashboard/bookings/<id>` | record offline advance: for, amount (prefilled), paid by, **note (required)**, "Record payment" | `POST /v1/vendor/bookings/<id>/offline-payments` | payment plus ledger, then `transitionBooking` to CONFIRMED with an event | customer confirmation (not captured in this run) |
| V11 | same page, online | none (shows "Advance · Online (test)") | none | the webhook or verify confirms it | none |
| V12 | refund / cancel | "Cancel booking" dialog with a refund preview; online refund form | `POST …/cancel`, refund route | CANCELLED, refund row | "Cancelled: …" |
| V13 | complete | "Mark as completed" (after the time has passed) | `POST …/complete` | COMPLETED | none |
| V14 | availability and blocks | `/dashboard/availability` (weekly hours, blocked periods) | rules and blocks routes | rules and blocks | none |

### 1b. Customer (hourly; multi-session and daily differ only where noted)

| # | Screen | Person does | API | DB change | Email |
|---|---|---|---|---|---|
| C1 | `/<slug>` vendor page | tap a service card (or the sticky "Book …", which adds a service-picker screen) | ISR page from `GET /v1/vendors/<slug>` | none | none |
| C2 | Step 2/6 "Choose a date and time" | tap a day (14-day strip), a time, "Continue". Multi: also "How long" radio. Daily: month calendar, start day, "N days" | `/availability/month` ×2, `/availability/slots` (daily: `/availability/days`) | none | none |
| C3 | Step 3/6 "Your details" | name, email, phone, notes (optional), "Continue" | none | none | none |
| C4 | Step 4/6 "Confirm your email" | Google, or "Send my code", then code, then "Verify and hold my time" | `POST /v1/auth/booking/otp/request`, `/verify`, then `POST /v1/bookings` | `users` (CLIENT), session, **booking HELD** (15-minute `hold_expires_at`), `booking_events` | "Your Bayana code"; "Your time with <vendor> is held" (has the private link) |
| C4g | Google path | back from Google, then **"Email confirmed … Hold this time"** button | `GET /v1/auth/me`, then `POST /v1/bookings` | HELD | as above |
| C5 | Step 5/6 "Review and agree" | key terms card, "Read the full terms" (collapsed), checkbox, "Agree and continue" | `GET /v1/bookings/<id>`, `POST …/accept` | contract snapshot, `transitionBooking` HELD to PENDING | vendor gets "New booking request" |
| C6 | Step 6/6. Offline: "Request sent to …". Online: "Pay the advance" | online: "Pay ₹…", Razorpay Checkout | `POST …/payment-order`, then Checkout, then `POST …/payment-verify` (and the webhook) | payment captured, CONFIRMED in the same transaction | "Confirmed: <service> with <vendor>" (customer and vendor) |
| C7 | "You're booked" / "Request sent" | "View your booking" | none | none | none |
| C8 | `/b/<id>` booking page | status, payment summary, timeline, contract, payment history, cancel | `GET /v1/bookings/<id>` | none | none |
| C9 | email link `/b/<id>?t=` on another device | read-only. To pay, agree or cancel: "sign in with the email you booked with" | as above | none | none |
| C10 | `/my-bookings` | sign in (Google or email code), list, "View booking and terms" | `/v1/client/bookings`, `/v1/auth/me` | none | code |
| C11 | cancel | "Cancel booking", refund preview, "Yes, cancel" | `POST …/cancel` | CANCELLED (and a refund if paid) | "Cancelled: …" |

### 1c. Returning and edge cases

| Case | What happens today (measured) |
|---|---|
| Vendor sign-in | `/login`: two Google sections ("I'm a vendor", "I booked with someone"), then the email-code form; 2 fields and 2 taps to the dashboard. |
| Customer closes the tab at the terms, same device | `/my-bookings` (still signed in), "View booking", held booking page, "Read the terms and finish", terms (resume), agree. That's 4 taps and 4 screens to get back where they were. |
| Customer on another device (email link) | Read-only page. Paying or cancelling needs `/my-bookings`, then "Use an email code instead", email, code, sign in, "View booking". That's 5 taps, 2 fields and a code email. |
| Expired hold | Agreeing after expiry shows "Your hold ran out … Nothing was charged", then "Choose a time again" (keeps the service, clears the time). Honest and clear. |
| Failed payment and retry | "That payment didn't go through (Card declined…). Try again, or use another card or UPI app." The button becomes "Try again: pay ₹2,000.00". Worked first time. |
| **Vendor books own page with the vendor email** | The code is accepted, then a red "Please sign in to continue." appears above a card saying **"Email confirmed … Hold this time"**. Pressing "Hold this time" repeats the error. **Dead end.** Cause: `POST /v1/bookings` refuses a non-CLIENT session with 401 `AUTHENTICATION_REQUIRED` (`apps/api/src/booking-routes.ts:52`), and the verify step doesn't check `user.role`. The Google path does check it (`googleErrorCopy.google_business_account`). |

---

## 2. Measurements (375 px)

| Flow | Screens | Taps | Fields | Words read | Notes |
|---|---|---|---|---|---|
| Customer hourly, offline, vendor page to "Request sent" | 8 | 8 | 4 (name, email, phone, code) | ≈ 820 | 6-step stepper; terms is a separate step |
| Customer multi-session | 8 | 9 | 4 | ≈ 960 | One extra tap for "How long"; a 254-word time screen (the rule text plus a summary block repeated) |
| Customer daily | 8 | 9 | 4 | ≈ 870 | Month grid, then the days radio |
| Customer online test, to "You're booked" | 9 | 9 (+1 for each retry) | 4 | ≈ 990 | **The pay step scrolls sideways** (≈ 460 px wide) |
| Customer resume, same device | 4 | 4 | 0 | 340 | |
| Customer, other device, to cancel | 7 | 6 | 2 | 520 | Read-only first, then a full sign-in |
| Vendor sign-up to published | 9 | 6 + 4 textareas | 11 | ≈ 910 | **Publish refused first time:** the "optional" description (V3) is required at V6, and the four policy boxes start empty |
| Vendor return to record advance | 4 | 4 | 3 (+1 note required) | ≈ 500 | |

Waits: the code email took 0.3 to 0.5 s locally. Creating the hold and loading the terms took 0.4 to 1.7 s. The first visit to `/my-bookings` took 6.2 s (route compile in dev).

---

## 3. Problems found (evidence first)

Severity order. Screenshot names refer to the `ux-before/` folder.

1. **Dead end when a vendor books with their vendor email.** See 1c and `vendor-own-email/07-after-verify.png`. The message is wrong ("Please sign in") and the "Hold this time" button can never succeed.
2. **Every time is shown twice for Indian customers.** The slots read "9:30 am / 9:30 am yours" (`customer-hourly/03-time-chosen.png`). `viewerTimezone()` returns `Asia/Calcutta` (Chromium and Node on Indian systems use that alias), and it is compared as a string with the vendor's `Asia/Kolkata` (`booking-flow.tsx` `TimeStep`). That doubles the text on the busiest screen and suggests a time difference that doesn't exist.
3. **The pay step overflows at 375 px.** The page is about 460 px wide (`customer-online/08-pay-step.png`, `hscroll=true`). The ghost button "Pay later from your booking page (while the time is held)" doesn't wrap. This is on the most trust-sensitive screen.
4. **The live footer shows placeholders.** It reads "[LEGAL BUSINESS NAME]", "[REGISTERED ADDRESS, CITY, STATE, PIN CODE]" and "[GRIEVANCE OFFICER NAME]" (confirmed on https://bayana.in today). These appear on every booking screen. The build guard only fires when `APP_ENV=production`. This is content you must supply; code can't fix it honestly.
5. **Too many steps and decisions for the customer.**
   - The stepper has 6 steps: Service, Time, Details, Verify, Review and agree, Pay.
   - Details and Verify are two screens, yet the email is typed on the first and repeated on the second.
   - The terms and the payment are two screens, each with its own primary button ("Agree and continue", then "Pay ₹…").
   - Calendly and Cal.com: time, then details, then done. HoneyBook and Stripe: the agreement and the payment on one screen.
6. **Publishing is refused on the vendor's first try** (`vendor-onboarding/09-after-publish.png`).
   - The description is marked *optional* in step 1 but is required to publish.
   - Step 4 is four empty textareas (placeholders only, so nothing is prefilled).
   - The vendor writes legal text from a blank page. There are no templates.
7. **Google return adds a "Hold this time" tap** (C4g). The hold could start on its own after verification, as it already does after a code.
8. **Status words differ by place.**

   | Where | Wording |
   |---|---|
   | Customer page heading | "Request received" |
   | Badge | "Pending" |
   | Customer timeline | "Terms agreed" |
   | Vendor timeline | raw "held → pending", "slot held", "terms accepted, advance to be arranged offline" (`vendor-return/03-booking-detail-pending.png`) |
   | Confirmation screen | "Request sent to …" |
9. **Repeated and technical text.**
   - Raw IANA ids: "Times in Asia/Kolkata", "(Asia/Kolkata)".
   - Prices with paise: "₹8,000.00", where ₹8,000 reads better.
   - The reassurance line "Your email is verified before anything is held. Payments, when enabled, are handled by Razorpay…" sits under every step.
   - Every booking step carries the full 15-link site footer (≈ 1,000 px of the 375 px page height).
   - The terms checkbox hint is 50 words.
10. **Weak hierarchy on the vendor booking page.** A solid red "Cancel booking" is the most prominent button in "Actions", above the real next step (recording the advance), which sits further down. The vendor's note is required even when the amount and method already say enough.
11. **The money summary only appears at the terms step.** Before that the customer sees the total only (`₹8,000.00`), not "₹2,000 now, ₹6,000 later". The vendor page shows it, but it disappears during steps 2 to 4.
12. **The email link is read-only, and the way out is a full sign-in from another page.** "To pay … sign in" sends the customer to `/my-bookings`, then "Use an email code instead", and they retype the email.
13. **The theme drifts from the brand.**
    - The primary is indigo `#3730A3` (purple), and in dark mode lavender `#A5A1FF` on near-black. That is the "purple on dark" look.
    - Bayana's identity is deep blue `#1E3A8A` with amber `#D97706`.
    - Fonts are Inter and Fraunces (serif), not a geometric sans.
14. **The dashboard home lists items but doesn't rank them.** "To do" sits in a sidebar card below the money cards on mobile. It shows no hold expiry, so the vendor can't see which request lapses first. The share card has a link and Copy, but no WhatsApp share or QR code.

What already works well and should be kept: the honest hold countdown; the "Nothing was charged" messages; the test-payment banner; the failed-payment retry; the refund preview before cancelling; idempotency; the inline validation shown after touch; the 44 px targets; and no overflow on 82 of the 83 screens.

---

## 4. Benchmark against the inspirations

| Principle | Bayana today | Gap |
|---|---|---|
| Calendly / Cal.com: about 3 screens; time picker plus details; instant confirmation | 8 screens, 6-step stepper | Merge details with verify, and terms with pay |
| Timezone clarity | "Times in Asia/Kolkata", plus false "yours" duplicates | Say "India time (IST)"; show the viewer's time only when the offset really differs |
| Fresha / Zoho: prices up front, obvious service picker | Good on the vendor page | Keep the advance and balance visible through the flow (sticky summary) |
| HoneyBook: agreement and payment in one place; a calm client portal | Separate terms and pay steps; the portal is read-only from email | One "Review and pay" screen; inline sign-in on the booking page |
| Stripe / Razorpay: say exactly what is paid | Good copy, but the pay step overflows | Fix the layout; one amount line; one button |
| Vendor onboarding with a preview and templates | Blank textareas; publish refused | Templates plus defaults, a live preview, a checklist |
| Dashboard: today's work first | Money cards first | "Needs your action" first, with expiry times |

---

## 5. Proposed simplified flows

### 5.1 Customer: 3 steps plus the confirmation (7 taps, 4 fields, online or offline)

1. **Choose** (one screen): the service (preselected from the card; a compact switcher if there are several), then the day strip or month, the time, and the length or days.
   - Sticky summary at the bottom on mobile: service, when, total, **advance now**, balance later, and one "Continue" button.
2. **Your details** (one screen): name, phone (+91 prefix, `type=tel`), email, then "Send code". The code field appears in place, with Google above as the alternative.
   - Verifying the code **starts the hold automatically** (the API call already happens there today). The Google return does the same, so the "Hold this time" button goes.
   - The countdown appears the moment the hold exists.
3. **Review and pay** (one screen): the key-terms summary (total, advance, balance, the cancellation rule in one sentence), "Read full terms" collapsed, and one checkbox with a short label (legal links stay, in a one-line hint).
   - One button:
     - Online: "Agree and pay ₹2,000".
     - Offline: "Agree and send request".
   - Behind it: `accept`, then `payment-order`, then Checkout, all on one tap. These are the same two existing endpoints, in order. A failure after accepting shows "Try again" without asking the customer to agree again (the booking is already PENDING).
4. **Confirmation**: what happens next, in order. For example: "Paid ₹2,000 · Confirmation sent to …". Or: "Studio X will contact you about the advance by <hold end>". Also "Add to calendar" (only if the .ics already exists for customers, otherwise left out) and "View booking".

Before: 8 screens, 8 to 9 taps (offline) or 9 taps (online), 4 fields. After: 4 screens, 7 taps, 4 fields. The hold time, the price and the server checks are unchanged.

### 5.2 Other proposals

Each lists: why, evidence, expected effect, risk, and whether it touches the API.

| ID | Change | Why / evidence | Expected effect | Risk | API? |
|---|---|---|---|---|---|
| P1 | **Vendor's own email:** after the code (and after Google), if `user.role !== "CLIENT"` show "This email belongs to a business account on Bayana. To book as a customer, use a different email." Clear the email and return to it. | Problem 1 | Removes the dead end | Low | **Small:** `POST /v1/bookings` with a signed-in non-CLIENT returns 403 `BUSINESS_ACCOUNT_CANNOT_BOOK` with that sentence (today: 401 "Verify your email"). Test: an integration test that a vendor session gets 403 with the code and no booking row; web unit test for the copy. |
| P2 | Timezone: compare **offsets at the slot's instant**, not names; label "India time (IST)" via the shared `timezoneLabel`. | Problem 2 | About 40 fewer words on the time screen; no false difference | Low | No |
| P3 | Fix the pay-step overflow (wrap or shorten "Pay later…"); add a no-horizontal-scroll assertion to the Playwright specs for every booking screen | Problem 3 | No sideways scroll | Low | No |
| P4 | Merge Details and Verify; auto-hold after verify (code and Google) | Problems 5 and 7 | −1 screen, −1 tap (Google −2) | Medium: flow state rewrite | No (same endpoints) |
| P5 | Merge Review and Pay into one screen with one button | Problem 5; HoneyBook / Stripe | −1 screen, −1 tap | Medium: a failure after accept must resume at pay | No (accept, then payment-order, in order) |
| P6 | Sticky booking summary (service, when, total, advance, balance) on mobile across steps 1 to 3 | Problem 11 | Price clarity at every step | Low | No |
| P7 | Booking-flow chrome: a slim footer (legal links in one row) and the reassurance line once; shorter checkbox label | Problem 9 | About 1,000 px less per step | Low | No |
| P8 | Money display: `₹8,000` when there are no paise, `₹8,000.50` otherwise (en-IN grouping kept, so `₹1,50,000`). A new display helper; receipts and invoices keep 2 decimals | Problem 9 | Easier to read | Low (shared helper; emails untouched unless approved) | No |
| P9 | One status vocabulary in `@bayana/shared` used by badge, heading, timeline and emails: Held, Awaiting advance, Confirmed, Completed, Cancelled, Expired, Paid after expiry (refunding). Vendor timeline in sentences ("Customer agreed to the terms"). Badge = icon + label | Problem 8 | Consistent words | Low | No (display mapping only; DB enums unchanged) |
| P10 | **Design tokens** (section 6): deep-blue primary, amber accent (fills and icons only; text uses `accent-ink`), soft-grey surfaces, a geometric sans (Plus Jakarta Sans via `next/font`, self-hosted, no extra runtime dependency), dark mode as a full second theme. Contrast is checked by a script in `pnpm.cmd test` | Problem 13 | Brand consistency | Medium: visual baselines change everywhere | No |
| P11 | Shared components: Button (has loading), Input (inline errors), Card, Badge (icon + label), Alert, Dialog, Toast, Skeleton, EmptyState, Stepper, **StickySummary**. Replace the one-off inline class strings (day and time buttons, radio chips) with shared variants | Many one-offs in booking-flow and onboarding | Consistency; smaller diffs later | Low to medium | No |
| P12 | **Onboarding templates:** service templates the vendor edits ("Wedding photography, full day" per day ₹45,000 at 30%; "Pre-wedding shoot, 2 hours" ₹15,000 at 25%; "Haircut and styling, 45 min"; "Tuition, 1 hour"; "Consultation, 30 min"; "Blank"). Prefilled plain-language terms, cancellation and rescheduling policies the vendor edits, matched to the service's refund tiers. Description required in step 1 (where it is asked) | Problem 6 | Publish succeeds on the first try | Low (client defaults; the server rules are unchanged) | No |
| P13 | Onboarding as a guided checklist with a **live preview** of the public page (the real `VendorPage` layout fed with the draft) beside the form (≥1024 px) or behind a "Preview" button (mobile) | Problem 6 | Confidence before publishing | Medium | No |
| P14 | Share card: copy link, **WhatsApp share** (`https://wa.me/?text=` link, no dependency), **QR code** | Problem 14 | Easier first share | Low (QR needs one small dependency, `qrcode`, client-side SVG; or skip QR) | No |
| P15 | Dashboard home order: **Needs your action** (advances to record with "hold ends <time>", soonest first; refunds to return; to complete), then **Upcoming** (today, then the next 7 days), then **This month's money** (advance collected, balance due), then the share card | Problem 14 | Today's work first | Low | **Small:** add `hold_expires_at` to the `record_advance` to-do rows in `GET /v1/vendor/overview`, and a calendar-month total for advances collected next to the existing 30-day figure. Integration test for both fields. |
| P16 | Vendor booking page: the primary action by state (PENDING offline: "Record advance" form first, with the note optional when the method is not "other"); Cancel becomes a secondary/danger-outline button under "More" | Problem 10 | Fewer misplaced taps | Low | **Small, only if the note becomes optional:** the offline-payment schema allows an empty note unless method=`other` (shared Zod plus a test). Otherwise no API change |
| P17 | Email link: on a read-only booking page, inline "Confirm it's you" (email prefilled from the booking and masked; send code; verify in place, then the same page becomes actionable) | Problem 12 | −3 taps, −1 field, no page hop | Low | No (existing customer OTP routes) |
| P18 | Emails: consistent header (Bayana mark plus the vendor name), a 600 px single column, ₹ format, an IST label, a plain-text part (check it is already sent and keep it), and one clear button per email | Phase 2 scope | Readable on phones | Low | Templates only (no schema change) |
| P19 | Empty and error states: every list (bookings, payments, customers, calendar) with a sentence plus the next action; `humanMessage` codes reviewed for "what to do next" | General | Fewer dead ends | Low | No |
| P20 | Footer placeholders: **you fill in `apps/web/lib/business-details.ts`**. I can make the footer hide unfilled fields instead of printing brackets, but I won't invent legal details | Problem 4 | Trust | None (code) / legal (content) | No |

**API changes in total, if P1, P15 and P16-note are approved:** 3 small, additive changes and no migration. Each gets integration tests. The booking engine (exclusion constraint, advisory lock, `transitionBooking`, snapshots, paise maths, hold expiry, payment verification, webhook) is not touched. The existing 20-simultaneous-holds test (`apps/api/test/integration/booking-engine.test.ts:127`) stays in the gate and is rerun.

---

## 6. Proposed tokens and theme rules

One place: `apps/web/app/globals.css` (`:root`, a dark block, `@theme inline`), mirrored in a `tokens.ts` that the contrast script reads. Ratios below were computed with the WCAG formula.

| Token | Light | Dark | Checked ratio |
|---|---|---|---|
| background | `#F7F8FA` | `#0B1220` | ink on bg 16.8 / 15.5 |
| surface | `#FFFFFF` | `#111A2E` | |
| surface-muted | `#F1F3F6` | `#18233A` | |
| ink | `#0F172A` | `#E6EAF2` | |
| muted (body secondary) | `#475569` | `#A3AEC2` | 7.6 on surface / 7.8 |
| border / input | `#E2E8F0` / `#CBD5E1` | `#243149` / `#33415C` | non-text |
| **primary** | **`#1E3A8A`** | `#93B4F5` | 10.4 on white; 8.3 on dark surface |
| primary-foreground | `#FFFFFF` | `#0B1220` | 10.4 / 9.0 |
| primary-soft | `#E8EEFB` | `#1B2B4F` | primary on soft 8.9 |
| **accent** (fills, icons, the mark) | **`#D97706`** | `#F59E0B` | 3.2 on white: **never body text** |
| accent-ink (accent text) | `#92400E` | `#FCD34D` | 7.1 on white |
| success / warning / danger | `#15803D` / `#B45309` / `#B91C1C` | `#4ADE80` / `#FBBF24` / `#F87171` | 5.0 / 5.0 / 6.5 on white |

Rules:
- Light by default.
- Dark mode follows the system unless `data-theme` pins it, and is a complete second theme: blue, not lavender.
- Amber marks, highlights and the small Indian touch (a thin amber rule under section headings, echoing a *toran* line); it is never used for body text.
- Type: geometric sans (Plus Jakarta Sans), scale 12/14/16/18/24/32/48, inputs ≥ 16 px.
- Radius 8/12, two shadows, 4 px spacing grid.
- The Fraunces serif is dropped.

---

## 7. Priorities

| # | Change | User impact | Effort | Risk |
|---|---|---|---|---|
| 1 | P1 vendor's-own-email message (+ API 403) | High | S | Low |
| 2 | P2 timezone duplicate fix + IST label | High | S | Low |
| 3 | P3 pay-step overflow + no-hscroll checks | High | S | Low |
| 4 | P4 details + verify on one screen, auto-hold | High | M | Med |
| 5 | P5 review + pay on one screen, one button | High | M | Med |
| 6 | P12 onboarding templates + prefilled policies | High | M | Low |
| 7 | P10 tokens + theme (blue/amber, dark theme) | High | M | Med (all baselines) |
| 8 | P11 shared components incl. StickySummary | Med | M | Low |
| 9 | P6 sticky summary | Med | S | Low |
| 10 | P15 dashboard home "Needs your action" (+ API fields) | Med | M | Low |
| 11 | P9 one status vocabulary | Med | S | Low |
| 12 | P7 slim booking chrome, shorter copy | Med | S | Low |
| 13 | P16 vendor booking page actions (note optional?) | Med | S | Low |
| 14 | P17 inline sign-in on the email-link page | Med | S | Low |
| 15 | P14 share card (WhatsApp, QR) | Med | S | Low (+1 dependency for QR) |
| 16 | P13 live preview in onboarding | Med | M | Med |
| 17 | P8 ₹ display without empty paise | Low | S | Low |
| 18 | P18 emails | Med | M | Low |
| 19 | P19 empty and error states pass | Low | S | Low |
| 20 | P20 footer hides unfilled placeholders (you supply the details) | High (trust) | S | Low |

**Phase 2 also includes:**
- Bundle size and Lighthouse for `/<slug>` and `/<slug>/book`, measured before the first Phase 2 commit.
- axe checks on every key page.
- Specs at 375 and 1280.
- The pre-existing `/design` 1280 baseline failure, either fixed or deliberately re-baselined.
