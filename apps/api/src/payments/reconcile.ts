import type { Pool } from "pg";
import type { PaymentProvider } from "./provider.js";

// Reconciliation (SPEC 11.7, PY-09): compares the gateway with the local ledger and reports differences.
// It never changes money records; fixing a difference is a human decision (re-verify, refund, or review).

export type Difference = { kind: string; detail: string; booking_id: string | null; provider_id: string | null; local_paise: number | null; provider_paise: number | null };

export async function reconcile(db: Pool, provider: PaymentProvider, options: { hours?: number; now?: Date } = {}) {
  const now = options.now ?? new Date(), hours = options.hours ?? 48;
  const from = Math.floor(now.getTime() / 1000) - hours * 3600, to = Math.floor(now.getTime() / 1000);
  const [remotePayments, remoteRefunds] = await Promise.all([provider.listPayments(from, to), provider.listRefunds(from, to)]);
  const differences: Difference[] = [];
  const add = (difference: Difference) => differences.push(difference);

  const localPayments = (await db.query<{ booking_id: string; provider_order_id: string; provider_payment_id: string | null; status: string; amount_paise: string }>(
    "SELECT booking_id,provider_order_id,provider_payment_id,status,amount_paise FROM payments WHERE provider='razorpay' AND (created_at >= to_timestamp($1) OR updated_at >= to_timestamp($1))", [from])).rows;
  const byOrder = new Map(localPayments.map(row => [row.provider_order_id, row]));
  const allOrders = new Map((await db.query<{ provider_order_id: string; booking_id: string; provider_payment_id: string | null; status: string; amount_paise: string }>("SELECT provider_order_id,booking_id,provider_payment_id,status,amount_paise FROM payments WHERE provider_order_id = ANY($1)", [remotePayments.map(payment => payment.order_id)])).rows.map(row => [row.provider_order_id, row]));

  for (const remote of remotePayments) {
    const local = allOrders.get(remote.order_id);
    if (remote.status !== "captured" && remote.status !== "refunded") continue;
    if (!local) { add({ kind: "unknown_order", detail: "Captured at Razorpay for an order Bayana does not know", booking_id: null, provider_id: remote.id, local_paise: null, provider_paise: remote.amount }); continue; }
    if (local.provider_payment_id !== remote.id) add({ kind: "missing_capture", detail: "Captured at Razorpay but not recorded here (missed webhook or closed tab); re-verify the payment", booking_id: local.booking_id, provider_id: remote.id, local_paise: null, provider_paise: remote.amount });
    else if (Number(local.amount_paise) !== remote.amount) add({ kind: "amount_mismatch", detail: "Amounts differ", booking_id: local.booking_id, provider_id: remote.id, local_paise: Number(local.amount_paise), provider_paise: remote.amount });
  }
  const remoteById = new Map(remotePayments.map(payment => [payment.id, payment]));
  for (const local of byOrder.values()) {
    if (!local.provider_payment_id || !["captured", "refunded", "partially_refunded"].includes(local.status)) continue;
    const remote = remoteById.get(local.provider_payment_id);
    if (remote && remote.status !== "captured" && remote.status !== "refunded") add({ kind: "not_captured_at_provider", detail: `Recorded as paid here but Razorpay says ${remote.status}`, booking_id: local.booking_id, provider_id: remote.id, local_paise: Number(local.amount_paise), provider_paise: remote.amount });
  }

  const localRefunds = new Map((await db.query<{ provider_refund_id: string; booking_id: string; status: string; amount_paise: string }>("SELECT provider_refund_id,booking_id,status,amount_paise FROM refunds WHERE provider_refund_id = ANY($1)", [remoteRefunds.map(refund => refund.id)])).rows.map(row => [row.provider_refund_id, row]));
  for (const remote of remoteRefunds) {
    const local = localRefunds.get(remote.id);
    if (!local) add({ kind: "unrecorded_refund", detail: "Refund exists at Razorpay but not here", booking_id: null, provider_id: remote.id, local_paise: null, provider_paise: remote.amount });
    else if (Number(local.amount_paise) !== remote.amount) add({ kind: "refund_amount_mismatch", detail: "Refund amounts differ", booking_id: local.booking_id, provider_id: remote.id, local_paise: Number(local.amount_paise), provider_paise: remote.amount });
    else if (remote.status === "processed" && local.status !== "processed") add({ kind: "refund_status_mismatch", detail: `Razorpay processed the refund; here it is ${local.status}`, booking_id: local.booking_id, provider_id: remote.id, local_paise: Number(local.amount_paise), provider_paise: remote.amount });
  }

  // Internal consistency: the ledger and the payment rows must tell the same story for every booking touched recently.
  const drift = await db.query<{ booking_id: string; ledger: string; rows: string }>(`
    SELECT b.id AS booking_id,
      COALESCE((SELECT -SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind='PAYMENT'),0) - COALESCE((SELECT SUM(amount_paise) FROM ledger_entries WHERE booking_id=b.id AND kind='REFUND'),0) AS ledger,
      COALESCE((SELECT SUM(amount_paise) FROM payments WHERE booking_id=b.id AND status IN ('captured','refunded','partially_refunded') AND verified_at IS NOT NULL),0) - COALESCE((SELECT SUM(amount_paise) FROM refunds WHERE booking_id=b.id AND status='processed'),0) AS rows
    FROM bookings b WHERE EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.updated_at >= to_timestamp($1))`, [from]);
  for (const row of drift.rows) if (Number(row.ledger) !== Number(row.rows)) add({ kind: "ledger_drift", detail: "Ledger and payment rows disagree", booking_id: row.booking_id, provider_id: null, local_paise: Number(row.rows), provider_paise: Number(row.ledger) });

  const review = await db.query<{ event_id: string; type: string; error: string | null }>("SELECT event_id,type,error FROM webhook_events WHERE needs_review OR (processed_at IS NULL AND received_at < now() - interval '10 minutes') ORDER BY received_at DESC LIMIT 50");
  for (const event of review.rows) add({ kind: "webhook_review", detail: `${event.type}: ${event.error ?? "not processed yet"}`, booking_id: null, provider_id: event.event_id, local_paise: null, provider_paise: null });
  return { from: new Date(from * 1000), to: now, checked: { payments: remotePayments.length, refunds: remoteRefunds.length }, differences };
}
