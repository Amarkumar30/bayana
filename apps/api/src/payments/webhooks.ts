import { pool } from "../database.js";
import { log } from "../logger.js";
import type { ProviderPayment, ProviderRefund } from "./provider.js";
import { paymentProvider, paymentsEnabled } from "./runtime.js";
import { applyCapturedPayment, applyProviderRefund, markOpenPayment, PaymentNotYetKnown } from "./service.js";

// Razorpay webhooks (SPEC 11.3): verified on the raw body, stored once per x-razorpay-event-id, answered fast, then processed.
// Delivery is at least once and unordered; every handler is idempotent.

export type WebhookReply = { status: number; body: Record<string, unknown> };
const reply = (status: number, code?: string, message?: string): WebhookReply => ({ status, body: code ? { error: { code, message, details: {} } } : { ok: true } });

export async function receiveWebhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined): Promise<WebhookReply & { process?: string }> {
  // A non-2xx makes Razorpay retry for 24 hours, so a misconfigured server loses nothing while it is being fixed.
  if (!paymentsEnabled()) return reply(503, "PAYMENT_DISABLED", "Payments are disabled");
  const provider = paymentProvider();
  if (!provider.webhookConfigured) return reply(503, "WEBHOOK_NOT_CONFIGURED", "Webhook secret is not set");
  if (!provider.verifyWebhookSignature(rawBody, signature)) return reply(400, "INVALID_WEBHOOK_SIGNATURE", "Invalid webhook signature");
  if (!eventId || eventId.length > 100) return reply(400, "MISSING_WEBHOOK_ID", "Missing webhook id");
  let payload: { event?: unknown };
  try { payload = JSON.parse(rawBody.toString("utf8")) as { event?: unknown }; } catch { return reply(400, "INVALID_JSON", "Body is not JSON"); }
  const type = typeof payload.event === "string" ? payload.event.slice(0, 100) : "unknown";
  const inserted = await pool.query("INSERT INTO webhook_events(event_id,type,payload) VALUES($1,$2,$3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id", [eventId, type, payload]);
  if (!inserted.rowCount) return { ...reply(200), body: { ok: true, duplicate: true } };
  return { ...reply(200), process: eventId };
}

type Payload = { event: string; payload?: { payment?: { entity?: ProviderPayment }; refund?: { entity?: ProviderRefund }; order?: { entity?: { id?: string } } } };

/** Applies one stored event. Errors that only mean "not yet" (a refund before its payment) leave it unprocessed for a retry. */
export async function processWebhookEvent(eventId: string) {
  const found = await pool.query<{ payload: Payload; processed_at: Date | null }>("SELECT payload,processed_at FROM webhook_events WHERE event_id=$1", [eventId]);
  const event = found.rows[0];
  if (!event || event.processed_at) return;
  const finish = (error: string | null, review = false) => pool.query("UPDATE webhook_events SET processed_at=CASE WHEN $3::boolean THEN NULL ELSE now() END,error=$2,needs_review=needs_review OR $4::boolean WHERE event_id=$1", [eventId, error, error !== null && !review && error.startsWith("Waiting"), review]);
  try {
    const payment = event.payload.payload?.payment?.entity, refund = event.payload.payload?.refund?.entity;
    switch (event.payload.event) {
      case "payment.captured": case "order.paid": {
        if (!payment?.id || !payment.order_id) return void await finish("Event has no payment entity", true);
        const result = await applyCapturedPayment(payment.order_id, { ...payment, status: "captured" }, "webhook");
        if (result.outcome === "mismatch") return void await finish(`Not applied: ${result.problem}`, true);
        await finish(null);
        // Something may have been waiting for this payment (refund events delivered first).
        await processPendingWebhooks(eventId);
        return;
      }
      case "payment.authorized": case "payment.failed":
        if (payment?.order_id) await markOpenPayment(payment.order_id, event.payload.event === "payment.failed" ? "failed" : "authorized", payment);
        return void await finish(null);
      case "refund.processed": case "refund.failed":
        if (!refund?.id || !refund.payment_id) return void await finish("Event has no refund entity", true);
        await applyProviderRefund(refund, event.payload.event === "refund.processed" ? "processed" : "failed");
        return void await finish(null);
      default: return void await finish(null);
    }
  } catch (error) {
    if (error instanceof PaymentNotYetKnown) return void await finish(error.message);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Processing failed";
    log("error", "webhook.processing_failed", { eventId, err: message });
    await finish(message, true);
  }
}

/** Retries events still waiting (for example a refund delivered before its payment). Safe to run late or twice. */
export async function processPendingWebhooks(exceptEventId?: string) {
  const pending = await pool.query<{ event_id: string }>("SELECT event_id FROM webhook_events WHERE processed_at IS NULL AND needs_review=false AND event_id IS DISTINCT FROM $1 ORDER BY received_at LIMIT 100", [exceptEventId ?? null]);
  for (const row of pending.rows) await processWebhookEvent(row.event_id);
}
