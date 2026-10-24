import Razorpay from "razorpay";
import { hmacMatches, type PaymentProvider, type ProviderPayment, type ProviderRefund } from "./provider.js";

type Raw = Record<string, unknown>;
const toPayment = (value: Raw): ProviderPayment => ({
  id: String(value.id), order_id: String(value.order_id ?? ""), amount: Number(value.amount), currency: String(value.currency), status: value.status as ProviderPayment["status"],
  method: typeof value.method === "string" ? value.method : null, amount_refunded: Number(value.amount_refunded ?? 0), error_description: typeof value.error_description === "string" ? value.error_description : null, created_at: Number(value.created_at)
});
const toRefund = (value: Raw): ProviderRefund => ({ id: String(value.id), payment_id: String(value.payment_id), amount: Number(value.amount), currency: String(value.currency), status: value.status as ProviderRefund["status"], created_at: Number(value.created_at) });

/** Razorpay over the official SDK. Secrets stay in this object; nothing here logs a key, secret or signature. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  private readonly client: Razorpay;
  get webhookConfigured() { return Boolean(this.webhookSecret); }
  constructor(readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string | undefined) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  async createOrder(input: { amountPaise: number; currency: "INR"; receipt: string; notes: Record<string, string> }) {
    const order = await this.client.orders.create({ amount: input.amountPaise, currency: input.currency, receipt: input.receipt, notes: input.notes }) as unknown as Raw;
    return { id: String(order.id), amount: Number(order.amount), currency: String(order.currency), receipt: String(order.receipt), status: String(order.status) };
  }
  async fetchPayment(paymentId: string) { return toPayment(await this.client.payments.fetch(paymentId) as unknown as Raw); }
  async createRefund(input: { paymentId: string; amountPaise: number; notes: Record<string, string> }) {
    return toRefund(await this.client.payments.refund(input.paymentId, { amount: input.amountPaise, notes: input.notes }) as unknown as Raw);
  }
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }) { return hmacMatches(this.keySecret, `${input.orderId}|${input.paymentId}`, input.signature); }
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) { return hmacMatches(this.webhookSecret, rawBody, signature); }
  async listPayments(fromSeconds: number, toSeconds: number) { return this.pages(skip => this.client.payments.all({ from: fromSeconds, to: toSeconds, count: 100, skip }) as unknown as Promise<{ items: Raw[] }>, toPayment); }
  async listRefunds(fromSeconds: number, toSeconds: number) { return this.pages(skip => this.client.refunds.all({ from: fromSeconds, to: toSeconds, count: 100, skip }) as unknown as Promise<{ items: Raw[] }>, toRefund); }
  private async pages<T>(fetchPage: (skip: number) => Promise<{ items: Raw[] }>, map: (value: Raw) => T) {
    const all: T[] = [];
    for (let skip = 0; skip < 10_000; skip += 100) { const page = await fetchPage(skip); all.push(...page.items.map(map)); if (page.items.length < 100) break; }
    return all;
  }
}
