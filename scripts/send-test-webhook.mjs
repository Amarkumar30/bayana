// node scripts/send-test-webhook.mjs <event> --order <order_id> [--payment <pay_id>] [--amount <paise>] [--refund <rfnd_id>] [--api <url>]
// Sends one Razorpay-style webhook to a running API (default http://localhost:4000), signed with RAZORPAY_WEBHOOK_SECRET from
// apps/api/.env exactly as Razorpay signs it (HMAC-SHA256 of the raw body, hex). The secret is never printed.
// Events: payment.captured (default), order.paid, payment.failed, refund.processed, refund.failed. Each run uses a new event id;
// pass --event-id to send the same id twice and see the duplicate ignored.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const env = require("dotenv").parse(readFileSync(path.join(root, "apps/api/.env")));
const args = process.argv.slice(2);
const event = args[0] && !args[0].startsWith("--") ? args[0] : "payment.captured";
const flag = name => { const at = args.indexOf(`--${name}`); return at === -1 ? undefined : args[at + 1]; };
const api = flag("api") ?? "http://localhost:4000", order = flag("order"), amount = Number(flag("amount") ?? 20000);
const payment = flag("payment") ?? (order ? `pay_${order.replace(/^order_/, "")}` : undefined), refund = flag("refund") ?? `rfnd_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
// The shell's RAZORPAY_WEBHOOK_SECRET wins (for an API started with its own env), else apps/api/.env.
const secret = process.env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) { console.error("RAZORPAY_WEBHOOK_SECRET is empty in apps/api/.env. Set it (any value of 16+ characters for local use) and restart the API."); process.exit(1); }
if (!order && !event.startsWith("refund.")) { console.error("Pass --order <order_id> (from the payments table or the API's payment-order reply)."); process.exit(1); }
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api) && !args.includes("--allow-remote")) { console.error(`Refusing to send to ${api}: this is for a local API. Add --allow-remote to send anyway.`); process.exit(1); }

const paymentEntity = { id: payment, entity: "payment", amount, currency: "INR", status: event === "payment.failed" ? "failed" : "captured", order_id: order, method: "upi", amount_refunded: 0, error_description: event === "payment.failed" ? "Payment declined (test)" : null, created_at: Math.floor(Date.now() / 1000) };
const refundEntity = { id: refund, entity: "refund", amount, currency: "INR", payment_id: payment, status: event === "refund.failed" ? "failed" : "processed", created_at: Math.floor(Date.now() / 1000) };
const payload = event.startsWith("refund.") ? { refund: { entity: refundEntity }, payment: { entity: paymentEntity } }
  : event === "order.paid" ? { payment: { entity: paymentEntity }, order: { entity: { id: order, amount, currency: "INR", status: "paid" } } } : { payment: { entity: paymentEntity } };
const body = JSON.stringify({ entity: "event", account_id: "acc_local", event, contains: Object.keys(payload), payload, created_at: Math.floor(Date.now() / 1000) });
const eventId = flag("event-id") ?? `evt_local_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(`${api}/webhooks/razorpay`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId }, body });
console.log(`${event} ${eventId} -> HTTP ${response.status} ${await response.text()}`);
