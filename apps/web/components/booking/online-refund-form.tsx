"use client";
import { useState, type FormEvent } from "react";
import { ONLINE_PAYMENT_LABEL, formatINR, onlineRefundSchema } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { api, humanMessage } from "@/lib/api";

type Payment = { id: string; provider: string; status: string; amount_paise: number; verified_at: string | null };
type Refund = { payment_id: string; amount_paise: number; status: string };
/** What can still go back online: verified Razorpay payments minus refunds that did not fail (the server checks it again). */
export const refundableOnline = (payments: Payment[], refunds: Refund[]) => payments
  .filter(payment => payment.provider === "razorpay" && payment.verified_at && ["captured", "partially_refunded"].includes(payment.status))
  .reduce((total, payment) => total + Math.max(0, payment.amount_paise - refunds.filter(refund => refund.payment_id === payment.id && refund.status !== "failed").reduce((sum, refund) => sum + refund.amount_paise, 0)), 0);

/**
 * Refund an online (test) payment without cancelling the booking, fully or partly. path: the vendor's or the admin's refund
 * route. The status (processed or failed) arrives from Razorpay's webhooks; money paid directly is returned by the business.
 */
export function OnlineRefundForm({ path, payments, refunds, onDone }: { path: string; payments: Payment[]; refunds: Refund[]; onDone: () => void }) {
  const refundable = refundableOnline(payments, refunds);
  const [rupees, setRupees] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [done, setDone] = useState(""); const [fields, setFields] = useState<Record<string, string>>({});
  if (refundable <= 0) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setDone("");
    const amount = Math.round(Number(rupees) * 100);
    const parsed = onlineRefundSchema.safeParse({ amount_paise: Number.isFinite(amount) ? amount : 0, reason: reason.trim() });
    const problems: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) problems[String(issue.path[0])] ??= issue.message;
    if (parsed.success && parsed.data.amount_paise > refundable) problems.amount_paise = `At most ${formatINR(refundable)} can be refunded online.`;
    setFields(problems); if (Object.keys(problems).length || !parsed.success) return;
    setBusy(true);
    try { await api(path, { body: parsed.data }); setDone(`Refund of ${formatINR(parsed.data.amount_paise)} sent to Razorpay. Its status appears here when Razorpay confirms it.`); setRupees(""); setReason(""); onDone(); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card><CardHeader title="Refund an online payment" description={`${ONLINE_PAYMENT_LABEL}: up to ${formatINR(refundable)} can go back to the customer's card or UPI. The booking stays as it is.`} />
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Amount (₹)" error={fields.amount_paise}>{p => <Input {...p} inputMode="decimal" value={rupees} onChange={event => setRupees(event.target.value.replace(/[^\d.]/g, ""))} placeholder={String(refundable / 100)} />}</Field>
        <Field label="Reason" hint="The customer sees this on the refund email." error={fields.reason}>{p => <Input {...p} value={reason} maxLength={300} onChange={event => setReason(event.target.value)} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}
        <Button className="w-fit" variant="secondary" loading={busy} loadingText="Sending the refund…">Refund</Button>
      </form>
    </Card>
  );
}
