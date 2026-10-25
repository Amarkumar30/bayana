# Localhost sign-off (Phase 10)

SPEC 16.7 is the staging go-live checklist. This is the same list as it applies to one Windows machine: web on `http://localhost:3000`, API on `http://localhost:4000`, `bayana_dev` in Docker, Mailpit for email, `PAYMENT_MODE=test`. Last run on 2026-10-25, branch `phase-10-hardening`.

**Automated part:** start the app with its output saved, then run the script:

```powershell
pnpm.cmd db:up
pnpm.cmd dev *>&1 | Tee-Object -FilePath $env:TEMP\bayana-dev.log      # window 1
$env:SIGNOFF_LOG="$env:TEMP\bayana-dev.log"; pnpm.cmd signoff:local     # window 2: prints PASS/FAIL per item, exit 0 when all pass
```

The script creates `signoff-…` vendors and customers in bayana_dev and never prints secret values. Items it does not cover have their own step in the table.

**Result:** 11 of 12 PASS locally. 1–5, 10 and 12 pass against the running app; 6, 7 and 9 pass by integration test; 8 passes simulated. 11 is NOT APPLICABLE on localhost. The Razorpay Checkout part of 4 is NOT TESTED. This does not replace the staging run of SPEC 16.7.

| # | Check | How to check locally | Expected | Result and evidence |
|---|---|---|---|---|
| 1 | /health and /ready | `signoff:local` item [1] (or open http://localhost:4000/health and /ready) | Both 200; /ready runs `SELECT 1` | **PASS**: both 200 |
| 2 | Signup, logout, password login, code login, same email | `signoff:local` [2] | Code signup, logout (then /me is 401), code login, add password, password login, code login again all succeed | **PASS**: all succeeded for one email |
| 3 | Cookies between web and API | `signoff:local` [3] | Cookie HttpOnly, SameSite=Lax, Path=/, host-only locally (no Domain); /me works twice; CORS allows the web origin with credentials; a foreign-origin POST is 403; web `/dashboard` renders with the cookie | **PASS**, as expected. `Domain=.bayana.in` can only be checked at staging. |
| 4 | Full booking with test payment | `signoff:local` [4]; for the online payment, `pnpm.cmd payments:smoke` and pay in Razorpay Checkout (docs/PAYMENTS_LOCAL.md) | HELD > PENDING > CONFIRMED; ledger correct; customer gets "held" and "Confirmed" emails in Mailpit | **PASS** with an offline advance: states as expected; ledger `PAYMENT -100000` with ₹3,000 due; both emails arrived; a real Razorpay test order was created. Paying it in Checkout: **NOT TESTED** (needs a person in a browser). |
| 5 | Double-click and two-browser race | `signoff:local` [5]; double-click: `pnpm.cmd test` (booking-engine.test.ts "idempotency (BK-05)") | Exactly one booking: one 201, one 409 `SLOT_TAKEN`; the same idempotency key returns the same booking | **PASS** |
| 6 | Close the tab after paying; webhook confirms | `pnpm.cmd test` (payments.test.ts "confirms a booking with no browser verify at all (closed tab)"). Real webhook: tunnel plus `RAZORPAY_WEBHOOK_SECRET` (docs/PAYMENTS_LOCAL.md) | A signed `payment.captured` alone confirms the booking | **PASS** by integration test. Real Razorpay webhook: **NOT TESTED** (`RAZORPAY_WEBHOOK_SECRET` empty, no tunnel). |
| 7 | Hold expires, then a late payment | `pnpm.cmd test` (payments.test.ts PY-06; booking-flow.test.ts "an expired hold cannot be accepted") | Free slot: re-claimed and confirmed. Taken slot: full automatic refund plus email. | **PASS** by integration test |
| 8 | 20 minutes idle, then /waking recovers | With `pnpm.cmd dev` running, make the browser's API calls answer 503 for a few seconds (Playwright `page.route`), open `/<slug>/book` | The page goes to `/waking?next=…` ("Getting things ready…"), then back to `/<slug>/book` once the API answers | **PASS** simulated: `/waking` at 8.0 s, back on the booking page at 12.3 s. Mocked versions: apps/web/e2e/public.spec.ts:47 and :58. A real sleep: **NOT APPLICABLE** locally (staging). |
| 9 | Replay a webhook | `pnpm.cmd test` (payments.test.ts "a duplicate event changes nothing", "verify and webhook racing each other…", "two retries applying one gateway refund at once…") | No duplicate payment, ledger row, confirmation or refund | **PASS** by integration test |
| 10 | Tick ran in the last 30 minutes; health green | `signoff:local` [10] (or `pnpm.cmd jobs:tick`, then /admin Health) | All four jobs `ok`; last tick under 1800 s ago | **PASS**: all four `ok`, last tick 0 s ago. The scheduled GitHub Actions tick is a staging check. |
| 11 | Email passes SPF, DKIM, DMARC | Not possible locally: Mailpit keeps all mail on this machine | All pass at mail-tester | **NOT APPLICABLE**: needs Brevo domain DNS records, then a mail-tester run at staging |
| 12 | No secret in repo, bundle or logs | `signoff:local` [12] (dev bundle and API log); after `pnpm.cmd build`, the same value scan over `apps/web/.next/static`; repo: the gitleaks command in docs/RUN_LOCAL.md | No secret value in any bundle file or the log; no sign-in code or password in the log; gitleaks "no leaks found" | **PASS**: 37 dev bundle files and 91 production client files hold none of the 7 secret values (names only: DATABASE_URL, DATABASE_URL_TEST, SESSION_SECRET, TICK_SECRET, SMTP_URL, RAZORPAY_KEY_SECRET, GOOGLE_CLIENT_SECRET); the log has none of them, none of the 7 codes used and not the password; gitleaks over 19 commits found no leaks; `.env` files and `backups/` are git-ignored |

## Defects found by this sign-off
- **Concurrent webhook retries flagged a good refund for review.** apps/api/src/payments/service.ts `applyProviderRefund`, insert at line 235. Two overlapping retries of a refund that arrived before its payment both inserted it, and the loser failed on `refunds_provider_refund_id_key`, overwriting the clean result with that error and `needs_review`. Fixed with `ON CONFLICT DO NOTHING`, then re-reading the row `FOR UPDATE`. Regression test in payments.test.ts (fails without the fix).
- **The PY-04 "tolerates any order" test read the event too early.** `settled()` treated a "Waiting for payment" error as final, so the test could read the event before the retry ran. `settled(id, { processed: true })` now waits for the processed state.
- **AU-04 and argon2 in tests.** Every password hash in the suite used the production cost. NODE_ENV=test now uses the argon2 minimum (`passwordHashOptions`, apps/api/src/auth.ts:18). A unit test proves production and development keep 64 MiB and 3 passes. The dummy hash for unknown emails uses the same parameters, so the timing comparison stays fair.
- **Sign-off script:** it reused an already-used Mailpit code (`OTP_INVALID`) and sent no phone number (`PHONE_REQUIRED`). Both fixed in scripts/signoff-local.mjs.
- **Visual tests:** the /design desktop baseline had been captured before hydration (blank avatars), and a timing-dependent scrollbar shifted every line. The test now waits for hydration and hides scrollbars in captures. The services spec no longer collides with the "saved" toast.
- **Environment, not code:** moving the repo broke pnpm's links and `apps/web/.next`. Two `next` processes sharing `.next` (dev with build, e2e or visual, including from another session) corrupt it. Run them one at a time.
