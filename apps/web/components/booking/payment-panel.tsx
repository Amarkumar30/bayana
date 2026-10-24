"use client";
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { formatINR } from "@bayana/shared";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { ApiError, api, humanMessage } from "@/lib/api";
import { tokenHeaders, type BookingView } from "./types";

type Order = { order_id: string; key_id: string; amount_paise: number; currency: string };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type Verified = { outcome: "confirmed" | "already" | "reclaimed" | "refund_pending" | "authorized" | "pending"; booking: BookingView };
type RazorpayInstance = { open: () => void; on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance } }

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const loadCheckout = () => new Promise<void>((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
  const script = existing ?? Object.assign(document.createElement("script"), { src: CHECKOUT_SRC, async: true });
  script.addEventListener("load", () => resolve()); script.addEventListener("error", () => reject(new Error("Checkout did not load")));
  if (!existing) document.body.append(script);
});

/**
 * Pays the advance with Razorpay Checkout (SPEC 11.2). Success is shown only when the server reports the booking CONFIRMED;
 * Checkout's own success callback only starts server-side verification.
 */
export function PaymentPanel({ bookingId, token, amountPaise, businessName, email, onSettled }: { bookingId: string; token: string | null; amountPaise: number; businessName: string; email?: string; onSettled: (booking: BookingView) => void }) {
  const [state, setState] = useState<"idle" | "opening" | "verifying" | "waiting">("idle");
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "danger"; text: string }>();
  const polling = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(polling.current), []);

  const settleWhenConfirmed = () => {
    setState("waiting"); setMessage({ tone: "info", text: "Your bank is confirming the payment. This usually takes a few seconds; you can keep this page open." });
    const started = Date.now();
    polling.current = setInterval(async () => {
      try {
        const booking = await api<BookingView>(`/v1/bookings/${bookingId}`, { headers: tokenHeaders(token) });
        if (booking.status !== "PENDING" || Date.now() - started > 90_000) { clearInterval(polling.current); setState("idle"); if (booking.status === "PENDING") setMessage({ tone: "warning", text: "We haven't heard from the bank yet. If money left your account, your booking confirms automatically and we email you." }); else onSettled(booking); }
      } catch { /* keep polling; the next round retries */ }
    }, 3000);
  };

  const pay = async () => {
    setMessage(undefined); setState("opening");
    let order: Order;
    try { order = await api<Order>(`/v1/bookings/${bookingId}/payment-order`, { body: {}, headers: tokenHeaders(token) }); await loadCheckout(); }
    catch (failure) { setState("idle"); setMessage({ tone: "danger", text: failure instanceof ApiError ? humanMessage(failure) : "The payment window could not open. Check your connection and try again." }); return; }
    if (!window.Razorpay) { setState("idle"); setMessage({ tone: "danger", text: "The payment window could not open. Check your connection and try again." }); return; }
    const checkout = new window.Razorpay({
      key: env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? order.key_id, order_id: order.order_id, amount: order.amount_paise, currency: order.currency, name: businessName,
      description: "Advance to confirm your booking", prefill: email ? { email } : undefined,
      handler: async (response: CheckoutResponse) => {
        setState("verifying"); setMessage({ tone: "info", text: "Checking your payment with Razorpay…" });
        try {
          const result = await api<Verified>(`/v1/bookings/${bookingId}/payment-verify`, { body: response, headers: tokenHeaders(token) });
          if (result.outcome === "authorized" || result.outcome === "pending") return settleWhenConfirmed();
          setState("idle"); setMessage(undefined); onSettled(result.booking);
        } catch (failure) {
          // Verification failing in the browser does not mean the payment failed: the webhook may still confirm it.
          if (failure instanceof ApiError && failure.code === "PAYMENT_SIGNATURE_INVALID") { setState("idle"); setMessage({ tone: "danger", text: "We couldn't verify that payment. If money left your account, it is confirmed or refunded automatically; you don't need to pay again." }); return; }
          settleWhenConfirmed();
        }
      },
      modal: { ondismiss: () => { setState(current => current === "opening" ? "idle" : current); setMessage(current => current ?? { tone: "info", text: "Payment window closed. Nothing was charged. You can try again while your time is held." }); } }
    });
    checkout.on("payment.failed", response => setMessage({ tone: "danger", text: `That payment didn't go through${response.error?.description ? ` (${response.error.description})` : ""}. Try again, or use another card or UPI app.` }));
    checkout.open();
  };

  return (
    <div className="grid gap-3">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button size="lg" block loading={state !== "idle"} loadingText={state === "opening" ? "Opening secure payment…" : state === "verifying" ? "Verifying…" : "Waiting for confirmation…"} onClick={() => void pay()}>Pay {formatINR(amountPaise)}</Button>
      <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden />Secured by Razorpay. Bayana never sees your card details.</p>
    </div>
  );
}
