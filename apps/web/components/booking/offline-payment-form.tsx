"use client";
import { useState } from "react";
import { formatAmount, offlinePaymentSchema, paiseFromRupees } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Notice } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/field";
import type { BookingView } from "@/components/booking/types";
import { ApiError, api, vendorMessage } from "@/lib/api";

/** The vendor records money received outside Bayana (PY-10). The API keeps an audit row and tags the ledger entry offline. */
export function OfflinePaymentForm({ view, onRecorded, onDeadlinePassed }: { view: Pick<BookingView, "id" | "status" | "advance_paise" | "paid_paise" | "balance_due_paise">; onRecorded: () => void; onDeadlinePassed?: (message: string) => void }) {
  const advanceDue = view.status === "PENDING" ? Math.max(0, view.advance_paise - view.paid_paise) : 0;
  const [kind, setKind] = useState<"advance" | "balance">(advanceDue > 0 ? "advance" : "balance");
  const [rupees, setRupees] = useState(((advanceDue || view.balance_due_paise) / 100).toFixed(2)); const [method, setMethod] = useState("upi"); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setDone("");
    let amount: number;
    try { amount = paiseFromRupees(rupees.trim()); } catch { setError("Enter the amount in rupees, for example 2000 or 2000.50."); return; }
    if (amount <= 0 || amount > view.balance_due_paise) { setError(`Enter an amount up to the balance due (${formatAmount(view.balance_due_paise)}).`); return; }
    const parsed = offlinePaymentSchema.safeParse({ kind, amount_paise: amount, method, note });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { const result = await api<{ confirmed: boolean }>(`/v1/vendor/bookings/${view.id}/offline-payments`, { body: parsed.data }); setDone(result.confirmed ? "Recorded. The booking is now confirmed." : "Recorded."); setNote(""); onRecorded(); }
    // After a passed deadline the page reloads to offer "Extend deadline"; the sentence stays above it.
    catch (failure) { if (failure instanceof ApiError && failure.code === "ADVANCE_DEADLINE_PASSED" && onDeadlinePassed) onDeadlinePassed(vendorMessage(failure)); else setError(vendorMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card className="grid gap-3">
      <CardHeader title="Record a payment received offline" description="Cash, or UPI or a bank transfer straight to you. The customer sees it and gets a receipt." />
      <form onSubmit={submit} noValidate className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="For">{p => <Select {...p} value={kind} onChange={event => setKind(event.target.value as "advance" | "balance")}><option value="advance">Advance</option><option value="balance">Balance</option></Select>}</Field>
          <Field label="Amount (₹)">{p => <Input {...p} inputMode="decimal" value={rupees} onChange={event => setRupees(event.target.value)} />}</Field>
        </div>
        <Field label="Paid by">{p => <Select {...p} value={method} onChange={event => setMethod(event.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></Select>}</Field>
        <Field label="Note" optional={method !== "other"} hint={method === "other" ? "Required for Other: say how it was paid." : "For example: UPI ref 4411, paid by Asha."}>{p => <Input {...p} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}
        <Button loading={busy} loadingText="Recording…">Record payment</Button>
      </form>
    </Card>
  );
}
