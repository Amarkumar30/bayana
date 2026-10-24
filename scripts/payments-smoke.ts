// Manual end-to-end check of a REAL Razorpay test-mode payment (not run in CI). See docs/PAYMENTS_LOCAL.md.
//
//   1. apps/api/.env: PAYMENT_MODE=test with your rzp_test_ key id and secret; dev database migrated (pnpm.cmd db:migrate).
//   2. pnpm.cmd db:up   and   pnpm.cmd dev   (API on SMOKE_API_URL, web on SMOKE_WEB_URL)
//   3. pnpm.cmd payments:smoke
//
// It creates a throwaway vendor and booking through the public API (codes read from Mailpit), creates a real test order,
// prints the order id, tells you where to pay, then polls until the booking is CONFIRMED and prints the ledger.
// It never prints keys, secrets or signatures; it only talks to the API, never to Razorpay directly.

const api = process.env.SMOKE_API_URL ?? "http://localhost:4000";
const web = process.env.SMOKE_WEB_URL ?? "http://localhost:3000";
const mailpit = process.env.SMOKE_MAILPIT_URL ?? "http://localhost:8025";
const say = (text = "") => process.stdout.write(`${text}\n`);
const fail = (text: string): never => { process.stderr.write(`\nSmoke test stopped: ${text}\n`); process.exit(1); };

type Json = Record<string, any>;
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let json: Json = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  return { status: response.status, json, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function expectOk(label: string, reply: Awaited<ReturnType<typeof call>>) {
  if (reply.status >= 400) fail(`${label} failed with HTTP ${reply.status}: ${reply.json.error?.code ?? ""} ${reply.json.error?.message ?? ""}`);
  return reply;
}
async function code(email: string, after: number) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Your Bayana code"`)}`).catch(() => null);
    if (response?.ok) {
      const { messages = [] } = await response.json() as { messages?: { Subject: string; Created: string }[] };
      const fresh = messages.filter(message => new Date(message.Created).getTime() >= after).sort((a, b) => b.Created.localeCompare(a.Created))[0];
      const found = fresh?.Subject.match(/(\d{6})$/)?.[1];
      if (found) return found;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return fail(`no code reached Mailpit (${mailpit}) for ${email}. Is it running (pnpm.cmd db:up) and is EMAIL_TRANSPORT=smtp?`);
}
const tag = Math.random().toString(36).slice(2, 8);

async function main() {
  say("Bayana payments smoke test (Razorpay TEST mode)\n");
  if ((await fetch(`${api}/health`).catch(() => null))?.ok !== true) fail(`the API is not answering at ${api}/health. Start it with pnpm.cmd dev.`);

  say("1/5 Creating a throwaway vendor (smoke-" + tag + ")…");
  const vendorEmail = `smoke-vendor-${tag}@example.test`; let asked = Date.now() - 1000;
  await expectOk("vendor code request", await call("POST", "/v1/auth/otp/request", { email: vendorEmail, purpose: "signup" }));
  const signup = await expectOk("vendor signup", await call("POST", "/v1/auth/signup", { email: vendorEmail, code: await code(vendorEmail, asked), password: `smoke-${tag}-violet-harbour` }));
  const vendorCookie = { cookie: signup.cookie }, slug = `smoke-${tag}`;
  await expectOk("vendor profile", await call("POST", "/v1/vendor/me", { business_name: `Smoke Studio ${tag}`, slug, city: "Mumbai", description: "Payments smoke test.", categories: ["other"], timezone: "Asia/Kolkata" }, vendorCookie));
  const service = await expectOk("service", await call("POST", "/v1/vendor/services", { name: "Smoke session", price_paise: 50_000, duration_minutes: 30, advance_type: "FIXED", advance_value: 10_000, cancellation_tiers: [{ min_hours_before: 24, refund_percent: 100 }] }, vendorCookie));
  await expectOk("hours", await call("PUT", "/v1/vendor/availability/rules", { windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start_time: "09:00", end_time: "20:00" })) }, vendorCookie));
  await expectOk("policies", await call("PATCH", "/v1/vendor/me", { terms: "Smoke test terms.", cancellation_policy: "Full refund until 24 hours before.", rescheduling_policy: "Not applicable.", phone_required: false }, vendorCookie));
  await expectOk("publish", await call("POST", "/v1/vendor/publish", {}, vendorCookie));

  say("2/5 Booking a time as a customer…");
  const customerEmail = `smoke-customer-${tag}@example.test`; asked = Date.now() - 1000;
  await expectOk("customer code request", await call("POST", "/v1/auth/booking/otp/request", { email: customerEmail }));
  const verified = await expectOk("customer code", await call("POST", "/v1/auth/booking/otp/verify", { email: customerEmail, code: await code(customerEmail, asked) }));
  const customer = { cookie: verified.cookie };
  let slot: { date: string; startsAt: string } | null = null;
  for (let offset = 1; offset <= 14 && !slot; offset++) {
    const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const slots = await call("GET", `/v1/vendors/${slug}/availability/slots?service_id=${service.json.id}&date=${date}`);
    if (slots.json.slots?.length) slot = { date, startsAt: slots.json.slots[0].startsAt };
  }
  if (!slot) fail("no open time found in the next 14 days.");
  const held = await expectOk("hold", await call("POST", "/v1/bookings", { slug, date: slot.date, service_id: service.json.id, starts_at: slot.startsAt, name: "Smoke Customer" }, { ...customer, "idempotency-key": crypto.randomUUID() }));
  const bookingId = held.json.booking.id as string, token = held.json.booking.access_token as string;
  const tokenHeader = { "x-booking-token": token };
  const view = await expectOk("booking view", await call("GET", `/v1/bookings/${bookingId}`, undefined, tokenHeader));
  if (!view.json.payments_enabled) fail("payments are disabled. Set PAYMENT_MODE=test in apps/api/.env (with your rzp_test_ keys) and restart the API.");
  await expectOk("terms", await call("POST", `/v1/bookings/${bookingId}/accept`, { terms_hash: view.json.contract_preview.sha256, accepted: true }, tokenHeader));

  say("3/5 Creating a real Razorpay test order…");
  const order = await expectOk("payment order", await call("POST", `/v1/bookings/${bookingId}/payment-order`, {}, tokenHeader));
  say(`    Order id: ${order.json.order_id}`);

  say("\n4/5 Pay in Checkout now (you have about 15 minutes before the hold ends):");
  say(`    Open: ${web}/b/${bookingId}?t=${encodeURIComponent(token)}`);
  say("    Click \"Pay ₹100.00\" and use one of Razorpay's documented TEST methods (no real money moves):");
  say("      Card  4100 2800 0000 1007 (Visa)  or  5555 5100 0008 1006 (Mastercard); any future expiry, any CVV;");
  say("            on the bank page enter any OTP of 4 to 10 digits, then Submit.");
  say("      UPI   success@razorpay   (failure@razorpay simulates a failed payment)");
  say("    To test webhook-only confirmation, close the tab right after paying (needs the tunnel and webhook from the doc).\n");

  say("5/5 Waiting for the booking to be CONFIRMED (Ctrl+C to stop)…");
  const started = Date.now(); let status = "";
  while (Date.now() - started < 20 * 60_000) {
    const current = await call("GET", `/v1/bookings/${bookingId}`, undefined, tokenHeader);
    if (current.json.status !== status) { status = current.json.status; say(`    status: ${status}`); }
    if (["CONFIRMED", "EXPIRED", "EXPIRED_PAID", "CANCELLED"].includes(status)) {
      say("\nLedger for this booking:");
      for (const payment of current.json.payments as Json[]) say(`    ${payment.kind.padEnd(8)} ${payment.provider.padEnd(9)} ${String(payment.status).padEnd(19)} ₹${(payment.amount_paise / 100).toFixed(2)}${payment.method ? ` (${payment.method})` : ""}`);
      for (const refund of current.json.refunds as Json[]) say(`    refund   ${String(refund.status).padEnd(29)} ₹${(refund.amount_paise / 100).toFixed(2)}`);
      say(`    total ₹${(current.json.total_paise / 100).toFixed(2)} · paid ₹${(current.json.paid_paise / 100).toFixed(2)} · balance ₹${(current.json.balance_due_paise / 100).toFixed(2)}`);
      process.exit(status === "CONFIRMED" ? 0 : 1);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  fail("still not confirmed after 20 minutes. Run pnpm.cmd payments:reconcile to compare Razorpay with the ledger.");
}
main().catch(error => fail(error instanceof Error ? error.message : String(error)));
