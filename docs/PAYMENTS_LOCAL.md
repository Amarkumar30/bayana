# Razorpay test mode on your machine

This is how to take a real **test-mode** payment through Bayana on localhost, including webhooks and refunds. No real money moves in test mode. Live mode is refused by this build.

## 1. Prerequisites

1. The dev database is migrated, including 013, 014 and 015. Back it up first, because 013 and 015 rename columns. Use the backup commands in `docs/PROGRESS.md` ("Session handoff"), then run `pnpm.cmd db:migrate`.
2. In `apps/api/.env`:
   ```
   PAYMENT_MODE=test
   RAZORPAY_KEY_ID=rzp_test_...        # from Razorpay Dashboard > Test mode > Account & Settings > API keys
   RAZORPAY_KEY_SECRET=...             # the matching key secret
   RAZORPAY_WEBHOOK_SECRET=            # leave empty until step 3; the webhook answers 503 until it is set
   ```
   The API refuses to start with an `rzp_live_` key unless the mode is `live`, and live is not allowed yet.
3. Optional: in `apps/web/.env.local`, set `NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...`. Checkout uses the key id the API returns with each order, so this is only a convenience. Never put the key secret in the web app.
4. Run `pnpm.cmd db:up` (Postgres and Mailpit), then `pnpm.cmd dev`.

## 2. Pay once, with the browser only (no webhook needed)

Run `pnpm.cmd payments:smoke`. It does the following:
- creates a throwaway vendor and a booking through the API;
- creates a real test order and prints its order id;
- prints the booking page link where you pay.

Open the link and click **Pay**. Use Razorpay's documented test methods ([test cards](https://razorpay.com/docs/payments/payments/test-card-details/), [test UPI](https://razorpay.com/docs/payments/payments/test-upi-details/)):

| Method | Details | Result |
|---|---|---|
| Card (Visa) | `4100 2800 0000 1007`, any future expiry, any CVV | Success after the mock bank page; enter any OTP of **4 to 10 digits** |
| Card (Mastercard) | `5555 5100 0008 1006`, any future expiry, any CVV | Same as above |
| Card, declined | `4100 2800 0006 0003` (Visa) or `5305 6200 0003 0003` (Mastercard); choose failure on the bank page | `card_declined`. Bayana shows "That payment didn't go through" and you can retry. |
| UPI | `success@razorpay` | Success |
| UPI | `failure@razorpay` | Failure |

Razorpay notes that in test mode, cancelling a UPI payment is recorded as a success.

The script polls until the booking is **CONFIRMED**, then prints the ledger: payments, refunds, paid and balance. The booking is confirmed only after the API has done all of these:
- checked the Checkout signature, HMAC-SHA256 of `order_id|payment_id` with the key secret;
- fetched the payment from Razorpay;
- matched it as `captured`, with the stored amount, currency and order.

## 3. Webhooks through a tunnel

Razorpay must reach your API over a public HTTPS URL on port 443; it cannot call `localhost`. Razorpay's [webhook testing guide](https://razorpay.com/docs/webhooks/validate-test/) recommends **zrok** and lists `ngrok.io` among the third-party testing domains it does not accept as webhook URLs. So use one of these instead of ngrok:

- **Cloudflare Tunnel** (quick tunnel, no account needed): `cloudflared tunnel --url http://localhost:4000` prints `https://<random>.trycloudflare.com`.
- **zrok**: `zrok share public http://localhost:4000` prints a public `https://…share.zrok.io` URL.

The URL changes every time you restart a quick tunnel, so update the webhook when it does.

Create the webhook:
1. In the Razorpay Dashboard, switch to **Test mode**, then open Account & Settings > Webhooks > Add new webhook.
2. Set **Webhook URL** to `https://<your-tunnel-host>/webhooks/razorpay`.
3. Set **Secret** to a new random value of at least 16 characters, for example `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. This is not your key secret.
4. Under **Active events**, tick `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed`.
5. Save. In test mode, Razorpay asks for an OTP when you add or edit a webhook; its docs give the test-mode default as `754081`.
6. Put the same secret in `apps/api/.env` as `RAZORPAY_WEBHOOK_SECRET=...` and restart the API.

How Bayana handles a webhook delivery:
- It verifies `X-Razorpay-Signature` on the raw body.
- It stores each event once, by `X-Razorpay-Event-Id`, and answers 200 straight away; a repeated event gets 200 and changes nothing.
- It processes the event after answering. Events can arrive in any order and any number of times.
- If the amount, currency or order doesn't match, the event is stored with an error, flagged `needs_review` in `webhook_events`, and not applied.

### Retries and replaying an event

From Razorpay's [webhook best practices](https://razorpay.com/docs/webhooks/best-practices/):
- **Any non-2xx counts as a failure.** Razorpay retries with exponential backoff for **24 hours** after the event was created. If it keeps failing for 24 hours, the webhook is disabled and Razorpay emails you, and you must re-enable it in the Dashboard.
- **Slow replies count as failures too.** A reply slower than **5 seconds** is treated as a timeout and resent. Bayana answers before processing for this reason.

To watch a retry deliver an event, stop the API (or the tunnel), pay, then start it again; Razorpay's next retry delivers the event. The Razorpay docs we checked don't describe a manual "resend" button, so rely on the retries. Then run `pnpm.cmd payments:reconcile`, which lists anything captured at Razorpay that Bayana has not recorded.

## 4. Webhook-only confirmation (the customer closes the tab)

This shows that a payment confirms even if the browser never reports back.
1. Start a booking and get to the Pay step.
2. In Chrome DevTools, open Network, right-click, and block the request URL pattern `*payment-verify*`. You can also close the tab the moment Checkout says the payment succeeded.
3. Pay with a success method. The page says it is waiting for confirmation.
4. Within seconds the `payment.captured` (or `order.paid`) webhook arrives through the tunnel, and the booking becomes CONFIRMED. Reload `/b/<id>`, or let `payments:smoke` poll.

## 5. Refunds

1. Take a booking to CONFIRMED with a test payment.
2. On the customer's booking page, click **Cancel booking**. The dialog shows the refund from the tiers that were snapshotted when the customer agreed to the terms.
3. Confirm. Bayana calls the refund API for exactly that amount, so the preview and the refund come from the same function (`refundPreview` in `@bayana/shared`). It records a `refunds` row.
4. When `refund.processed` arrives, it is matched to that row, and the ledger gets one REFUND entry; repeats change nothing. The refund also appears in the Dashboard under Transactions > Refunds.
5. Money recorded as paid offline is never sent back through Razorpay. Its refund row is `manual`: the vendor returns it directly.

A payment that lands after the hold expired re-claims the slot if it is still free. Otherwise it is refunded in full automatically and the customer is emailed (queued in the outbox).

## 6. Reconcile

`pnpm.cmd payments:reconcile [hours]` (default 48) compares Razorpay's payments and refunds with the local ledger and prints each difference. It is report-only, never changes money, and exits with code 1 when it finds differences.
