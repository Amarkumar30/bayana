# Bayana — Full Project Plan
### Vendor booking, calendar-lock, contract & payment platform for Indian wedding vendors

---

## 1. What we're actually building

One sentence: **A tool a solo wedding vendor uses to manage their own calendar, so no two clients can ever book the same date, and every booking comes with an advance payment and a signed contract, automatically.**

Not a marketplace. Not a discovery app. One vendor, their own calendar, their own clients. Couples only ever interact with *their* vendor's booking page — they never browse or compare vendors on your platform.

**The core promise to a vendor:** "Google Calendar tells you a date is busy. Bayana makes it *impossible* for someone else to take that date once a client has paid — and it hands them a contract at the same time, automatically."

---

## 2. Scope discipline — read this before writing any code

You have 4 months and you're one person. The single biggest risk to this project is scope creep, not lack of skill. Every feature below is tagged:

- **MVP** — build this, nothing else, for the first 10 weeks
- **V1.5** — add only after 3+ real vendors are actively using the MVP
- **Later** — don't think about this until you have paying customers

If a feature isn't tagged MVP, it does not exist for you right now. Write this on a sticky note if you have to.

---

## 3. Tech stack — and why each choice

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite** (plain JS, not TypeScript) | You know React already from your course. Vite over Create React App — faster dev server, it's the current standard. Skip TypeScript for now — it's a real skill but it will slow you down in month 1, and your course brief explicitly says skip it. |
| Styling | **Tailwind CSS** | Fast to build clean UI solo without a designer. Avoid heavy component libraries (MUI, Ant) early — they fight you when you need custom booking-calendar UI. |
| Backend | **Node.js + Express** | Matches your course stack. Mature ecosystem, huge community, every problem you hit has a Stack Overflow answer already. |
| Database | **PostgreSQL** | Non-negotiable for this project. You need real transactions, row locking, and constraints — this is the whole point of your hard requirement. Never consider a NoSQL database here. |
| ORM | **Prisma** | Type-safe queries, painless migrations, and — importantly — you can still drop into raw SQL for the transaction-critical booking logic where you need full control (`$queryRaw`, `$transaction`). Knex is a fine alternative if you want to write more raw SQL yourself; Prisma is faster to build with. |
| Auth | **JWT (jsonwebtoken) + bcrypt** | Standard, you control it fully, no third-party dependency for something this core. Session-based auth (with `express-session` + Postgres session store) is an equally valid alternative — pick JWT if you'll ever have a separate mobile app later, since it's stateless. |
| Payments | **Razorpay** | The correct choice for India — native UPI support, well-documented Node SDK, standard for Indian SaaS/booking products. Do not use Stripe (this is literally why HoneyBook can't operate in India — don't repeat their mistake). |
| File storage | **Cloudinary or AWS S3** | For vendor portfolio images later (V1.5). Not needed for MVP. |
| Hosting (backend) | **Railway or Render** | Free/cheap tiers, dead simple Postgres + Node deployment, you're not fighting DevOps as a solo student. |
| Hosting (frontend) | **Vercel** | Free, instant deploys from GitHub, zero config for a Vite/React app. |
| Notifications | **WhatsApp Cloud API** (Meta) or **Twilio** for SMS as fallback | Vendors live on WhatsApp, not email. This is a real differentiator vs HoneyBook, which is email-first. Budget: WhatsApp Cloud API has a free tier for low volume, good enough for your first 10-20 vendors. |
| Version control | **Git + GitHub** | Private repo. Commit daily, even small commits — your course grades this, and it's also just good practice. |

**What NOT to use, and why:** No Redux (React state is enough for this scope). No GraphQL (REST is what's assessed and it's simpler for a booking API). No microservices, no Docker/Kubernetes for now (one server, don't overbuild). No TypeScript yet (learn it after this project, not during).

---

## 4. System architecture (MVP)

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│  React Frontend  │  HTTPS  │  Express API      │  SQL    │ PostgreSQL  │
│  (Vercel)         │────────▶│  (Railway/Render) │────────▶│  (Railway)   │
└─────────────────┘         └──────────────────┘         └─────────────┘
                                      │
                                      ├──▶ Razorpay API (payments)
                                      └──▶ WhatsApp Cloud API (reminders)
```

Two frontend "surfaces" from one React codebase:
1. **Vendor dashboard** (`/dashboard/*`) — behind login, calendar view, bookings list, contract template setup
2. **Public booking page** (`/book/:vendorSlug`) — no login required, this is what the vendor shares with clients

---

## 5. Database schema (full MVP)

```sql
-- Vendors
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  business_name VARCHAR(150),
  service_type VARCHAR(50) NOT NULL,      -- 'photography', 'decor', 'catering', 'makeup'
  city VARCHAR(100),
  phone VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,
  password_hash TEXT NOT NULL,
  price_per_event NUMERIC(10,2),
  advance_percent NUMERIC(5,2) DEFAULT 20.00,   -- what % they require as advance
  slug VARCHAR(100) UNIQUE NOT NULL,             -- bayana.in/rahul-photography
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vendor's manually blocked dates (personal events, days off)
CREATE TABLE vendor_blocked_dates (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason VARCHAR(100),
  UNIQUE(vendor_id, date)
);

-- Clients (couples) — kept simple, no login required for them
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bookings — the core table, where the hard requirement lives
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id),
  client_id INT REFERENCES clients(id),
  event_date DATE NOT NULL,
  event_type VARCHAR(50),                 -- 'wedding', 'sangeet', 'reception', 'engagement'
  status VARCHAR(20) DEFAULT 'pending_payment',
       -- pending_payment | confirmed | cancelled | expired
  total_amount NUMERIC(10,2) NOT NULL,
  advance_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP                    -- auto-expire unpaid holds after e.g. 30 min
);

-- THE constraint that actually prevents double-booking at the DB level
CREATE UNIQUE INDEX one_confirmed_booking_per_vendor_date
ON bookings (vendor_id, event_date)
WHERE status = 'confirmed';

-- Payments
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  booking_id INT REFERENCES bookings(id),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'initiated',  -- initiated | success | failed | refunded
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contract templates — vendor sets this up once
CREATE TABLE contract_templates (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id) UNIQUE,
  template_text TEXT NOT NULL,   -- with placeholders: {{client_name}}, {{event_date}}, {{amount}}
  cancellation_policy TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Signed/accepted contracts per booking — append-only, never edited after acceptance
CREATE TABLE booking_contracts (
  id SERIAL PRIMARY KEY,
  booking_id INT REFERENCES bookings(id) UNIQUE,
  filled_text TEXT NOT NULL,      -- final rendered contract text, frozen at acceptance time
  accepted_at TIMESTAMP,
  accepted_ip VARCHAR(45)
);

-- Append-only audit trail — every status change logged, never overwritten
CREATE TABLE booking_history (
  id SERIAL PRIMARY KEY,
  booking_id INT REFERENCES bookings(id),
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  changed_at TIMESTAMP DEFAULT NOW(),
  note TEXT
);
```

---

## 6. The concurrency-safe booking flow (your hard requirement — get this right first)

This is what you demo to prove the system works. Build and stress-test this **before** touching any UI polish.

```javascript
// bookingService.js — pseudocode of the critical transaction

async function createBooking(vendorId, clientData, eventDate, amount) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock the vendor row so concurrent requests for this vendor serialize
    await tx.$executeRaw`SELECT id FROM vendors WHERE id = ${vendorId} FOR UPDATE`;

    // 2. Check no CONFIRMED booking already exists for this date
    const existing = await tx.booking.findFirst({
      where: { vendorId, eventDate, status: 'confirmed' }
    });
    if (existing) {
      throw new ConflictError('This date was just booked by someone else.');
    }

    // 3. Create the client + a pending_payment booking (holds the date for ~30 min)
    const client = await tx.client.create({ data: clientData });
    const booking = await tx.booking.create({
      data: {
        vendorId, clientId: client.id, eventDate,
        status: 'pending_payment',
        totalAmount: amount,
        advanceAmount: amount * 0.2,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });

    return booking;
  });
}

async function confirmBookingAfterPayment(bookingId, razorpayPaymentId) {
  return await prisma.$transaction(async (tx) => {
    // The partial unique index is the real safety net here —
    // even if two pending bookings somehow both reach this point,
    // only ONE can ever successfully flip to 'confirmed' for a given
    // vendor+date. The second will throw a unique constraint violation,
    // which you catch and turn into "sorry, that date is taken."
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' }
    });

    await tx.payment.create({
      data: { bookingId, amount: booking.advanceAmount, status: 'success', razorpayPaymentId }
    });

    await tx.bookingHistory.create({
      data: { bookingId, oldStatus: 'pending_payment', newStatus: 'confirmed' }
    });

    return booking;
  });
}
```

**How you'll test this for real (your week 5 milestone):** open two browser tabs, load the same vendor's booking page in both, pick the same date, click "pay" in both tabs within a second of each other. One should succeed. The other should get a clean "this date was just taken" error — not a crash, not a silent double-booking. Write an automated test for this too (see Section 9).

---

## 7. Feature breakdown by phase

### MVP (Weeks 1–12 — this is your course deliverable)

**Vendor side:**
- Sign up / login (phone + password)
- Onboarding: business name, service type, city, price, advance %
- Set up contract template (one-time, plain text with placeholders)
- Calendar view: see confirmed bookings, manually block personal dates
- Booking list with status (pending / confirmed / cancelled)
- Get shareable public link (`bayana.in/your-slug`)

**Client side (no login):**
- Open vendor's public link
- See calendar with available/unavailable dates
- Pick a date, enter name + phone
- See contract terms (auto-filled), click "I agree"
- Pay advance via Razorpay (UPI)
- Get confirmation (on-screen + WhatsApp/SMS)

**System:**
- Concurrency-safe booking (Section 6)
- Auto-expire unpaid holds after 30 minutes (cron job or simple scheduled check)
- Append-only booking history

### V1.5 (only after 3+ real active vendors, likely months 5–8)
- WhatsApp reminders (7 days, 1 day before event)
- Multiple event types per booking (mehendi + wedding + reception as one client relationship)
- Vendor portfolio images on public page
- Basic analytics for vendor (bookings this month, revenue)
- Cancellation flow with partial refund logic

### Later (only with real revenue/traction, 8+ months out)
- Multi-vendor coordination (a couple's vendors can see each other's confirmed dates for the same wedding)
- Vendor discovery layer (opt-in, separate product decision — this is the marketplace pivot, don't do this casually)
- Team accounts (assistants, second shooters)
- Native mobile app

---

## 8. Bonus marks / genuine differentiators vs HoneyBook

These map to your course's optional bonus marks *and* are real product advantages:

| Feature | Course bonus | Product value |
|---|---|---|
| Socket.io — live "someone is viewing this date" indicator on booking page | 3 marks | Creates urgency, and is literally impossible to fake with a static Google Calendar |
| Jest/Vitest + Supertest — automated tests, especially the double-booking race condition test | 4 marks | This is the single most convincing thing you can show in an interview or to a vendor: "here's an automated test proving it can't double-book" |
| Deploy to Render/Railway/Vercel | 2 marks | Also just means real vendors can actually use it |

---

## 9. Testing strategy (don't skip this — it's marked, and it's your proof)

Write these tests, in this order:

1. **Unit test:** booking creation rejects a date that's already `confirmed`
2. **Concurrency test (the important one):** fire two simultaneous booking requests for the same vendor+date using `Promise.all()` and assert exactly one succeeds
3. **Integration test (Supertest):** full flow — create booking → simulate payment webhook → confirm booking → assert contract is generated
4. **Manual test:** the two-browser-tabs demo from Section 6, recorded on video for your viva

```javascript
// Example concurrency test with Vitest
test('only one booking succeeds when two clients book the same date simultaneously', async () => {
  const [result1, result2] = await Promise.allSettled([
    createAndConfirmBooking(vendorId, client1Data, testDate, amount),
    createAndConfirmBooking(vendorId, client2Data, testDate, amount)
  ]);

  const succeeded = [result1, result2].filter(r => r.status === 'fulfilled');
  expect(succeeded.length).toBe(1);
});
```

---

## 10. Security basics (non-negotiable, even for a student project)

- Passwords: bcrypt, never plain text, never even logged
- Never trust the client for the price — always recompute `advanceAmount` server-side from the vendor's stored price, never accept it from the frontend request body
- Validate every input server-side (even though you also validate in React) — this is what your course's Postman testing will check
- `.env` for all secrets (Razorpay keys, JWT secret, DB URL) — never commit this file, add it to `.gitignore` in commit #1
- Rate-limit the public booking endpoint (basic `express-rate-limit`) so no one can spam-hold every date on a vendor's calendar

---

## 11. 16-week roadmap

| Weeks | Focus | Deliverable |
|---|---|---|
| 1 | Setup, ER diagram, proposal | Repo created, Postgres running, one-page proposal submitted |
| 2–3 | Schema + seed script | All tables created, realistic seed data (multiple vendors, bookings) |
| 4–6 | **Transactions & concurrency** — the hard requirement | Booking creation, locking, unique constraint, first concurrency test passing |
| 7–8 | Express API — auth, vendor CRUD, contract templates | Postman collection covering every endpoint |
| 9–10 | React frontend — vendor dashboard | Login, calendar view, booking list, contract setup screen |
| 11 | React frontend — public booking page | Client-facing flow: pick date → contract → pay |
| 12 | Razorpay integration + WhatsApp/SMS confirmation | End-to-end flow works with real (test-mode) payment |
| 13 | Indexes, EXPLAIN, load test with 5,000+ seeded bookings | Query performance verified at volume |
| 14 | Automated tests (Section 9) | Full test suite passing, including the concurrency test |
| 15 | Deploy (Vercel + Railway), polish UI | Live URL, works on mobile browser |
| 16 | README, viva prep, first real vendor pilot conversations | Documentation done, 1–2 real vendors trying it |

---

## 12. Folder structure

```
bayana/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── vendor/     # Dashboard, calendar, bookings, contract setup
│   │   │   └── public/     # BookingPage.jsx (the /book/:slug route)
│   │   ├── components/
│   │   ├── api/            # fetch wrappers
│   │   └── App.jsx
├── server/                  # Express backend
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── routes/          # auth, vendors, bookings, payments, contracts
│   │   ├── services/        # bookingService.js (the transaction logic)
│   │   ├── middleware/       # auth check, validation
│   │   └── index.js
│   ├── tests/
│   └── .env.example
└── README.md
```

---

## 13. Definition of "done" for the course submission

- [ ] ER diagram matches implemented schema
- [ ] Double-booking is provably impossible (automated test + video demo)
- [ ] Every booking = one atomic transaction (booking + payment + contract acceptance)
- [ ] Postman collection covering all endpoints, with both valid and invalid inputs
- [ ] Handles 5,000+ rows without slowing down (tested with `EXPLAIN ANALYZE`)
- [ ] Deployed and reachable via a public URL
- [ ] README explains the hard requirement and how it's solved, in plain language

---

## 14. What "better than HoneyBook" actually means for you, realistically

Don't chase feature parity with HoneyBook — it has a 10+ year head start and a full team. Your genuine advantages, keep these as your north star every time you're tempted to add scope:

1. **Built for UPI, not Stripe** — works in India at all, which HoneyBook literally cannot do
2. **WhatsApp-native, not email-native** — matches how your actual users communicate
3. **Priced for a solo Indian vendor** (₹299–499/month), not $29–129/month
4. **Simpler by design** — HoneyBook is bloated for a beginner; you can win by being the tool a vendor learns in 10 minutes

That's the whole differentiation. Don't add features to compete on HoneyBook's terms — compete on being obviously built *for this exact person, in this exact market*.
