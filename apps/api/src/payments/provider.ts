import { createHmac, timingSafeEqual } from "node:crypto";

// The one seam between Bayana and a payment gateway. RazorpayProvider talks to Razorpay; FakeProvider backs every automated test.

export type ProviderOrder = { id: string; amount: number; currency: string; receipt: string; status: string };
export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";
export type ProviderPayment = { id: string; order_id: string; amount: number; currency: string; status: ProviderPaymentStatus; method: string | null; amount_refunded: number; error_description: string | null; created_at: number };
export type ProviderRefund = { id: string; payment_id: string; amount: number; currency: string; status: "pending" | "processed" | "failed"; created_at: number };

export interface PaymentProvider {
  readonly name: "razorpay" | "fake";
  readonly keyId: string;
  /** False until RAZORPAY_WEBHOOK_SECRET is set; webhooks then answer 503 so Razorpay keeps retrying. */
  readonly webhookConfigured: boolean;
  createOrder(input: { amountPaise: number; currency: "INR"; receipt: string; notes: Record<string, string> }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<ProviderRefund>;
  /** Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id) with the key secret (SPEC 11.2). */
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret (SPEC 11.3). */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  listPayments(fromSeconds: number, toSeconds: number): Promise<ProviderPayment[]>;
  listRefunds(fromSeconds: number, toSeconds: number): Promise<ProviderRefund[]>;
}

/** Constant-time comparison of a hex HMAC; a wrong length is a mismatch, never an exception. */
export function hmacMatches(secret: string | undefined, message: string | Buffer, signature: string | undefined) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export const hmacHex = (secret: string, message: string | Buffer) => createHmac("sha256", secret).update(message).digest("hex");
