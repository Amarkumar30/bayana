import { hmacHex, hmacMatches, type PaymentProvider, type ProviderOrder, type ProviderPayment, type ProviderRefund } from "./provider.js";

/**
 * In-memory gateway for tests: no network, no real keys. Orders and payments behave like Razorpay's test mode.
 * A payment id `pay_fake_<order id without "order_">` belongs to that order, so a browser stub can pay without talking to it.
 */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly webhookConfigured = true;
  readonly orders = new Map<string, ProviderOrder>();
  readonly payments = new Map<string, ProviderPayment>();
  readonly refunds = new Map<string, ProviderRefund>();
  /** Calls made, for assertions such as "the duplicate request created no second order". */
  readonly calls: string[] = [];
  private counter = 0;
  constructor(readonly keyId = "rzp_test_fakeKeyId", private readonly keySecret = "fake_key_secret_for_tests", private readonly webhookSecret = "fake_webhook_secret_for_tests") {}

  async createOrder(input: { amountPaise: number; currency: "INR"; receipt: string }) {
    this.calls.push("createOrder");
    const order = { id: `order_fake${String(++this.counter).padStart(6, "0")}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, amount: input.amountPaise, currency: input.currency, receipt: input.receipt, status: "created" };
    this.orders.set(order.id, order);
    return order;
  }
  /** Simulates the customer paying in Checkout. Returns what Checkout hands the browser. */
  pay(orderId: string, options: { status?: ProviderPayment["status"]; amount?: number; currency?: string; method?: string } = {}) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Unknown fake order ${orderId}`);
    const payment: ProviderPayment = { id: FakeProvider.paymentIdFor(orderId), order_id: orderId, amount: options.amount ?? order.amount, currency: options.currency ?? order.currency, status: options.status ?? "captured", method: options.method ?? "card", amount_refunded: 0, error_description: options.status === "failed" ? "Card declined (fake)" : null, created_at: Math.floor(Date.now() / 1000) };
    this.payments.set(payment.id, payment);
    return { razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: this.checkoutSignature(orderId, payment.id), payment };
  }
  static paymentIdFor(orderId: string) { return `pay_fake_${orderId.replace(/^order_/, "")}`; }
  checkoutSignature(orderId: string, paymentId: string) { return hmacHex(this.keySecret, `${orderId}|${paymentId}`); }
  webhookSignature(rawBody: string | Buffer) { return hmacHex(this.webhookSecret, rawBody); }

  async fetchPayment(paymentId: string) {
    this.calls.push("fetchPayment");
    const known = this.payments.get(paymentId);
    if (known) return { ...known };
    // A payment made by the browser stub: derive it from its order, captured in full.
    const orderId = `order_${paymentId.replace(/^pay_fake_/, "")}`;
    const order = this.orders.get(orderId);
    if (!paymentId.startsWith("pay_fake_") || !order) throw Object.assign(new Error("The id provided does not exist"), { statusCode: 400 });
    return this.pay(orderId).payment;
  }
  async createRefund(input: { paymentId: string; amountPaise: number }) {
    this.calls.push("createRefund");
    const payment = this.payments.get(input.paymentId) ?? await this.fetchPayment(input.paymentId);
    if (payment.status !== "captured" && payment.status !== "refunded") throw Object.assign(new Error("Payment is not captured"), { statusCode: 400 });
    if (payment.amount_refunded + input.amountPaise > payment.amount) throw Object.assign(new Error("Refund exceeds the payment"), { statusCode: 400 });
    payment.amount_refunded += input.amountPaise; if (payment.amount_refunded === payment.amount) payment.status = "refunded";
    this.payments.set(payment.id, payment);
    const refund: ProviderRefund = { id: `rfnd_fake${String(++this.counter).padStart(6, "0")}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, payment_id: input.paymentId, amount: input.amountPaise, currency: "INR", status: "processed", created_at: Math.floor(Date.now() / 1000) };
    this.refunds.set(refund.id, refund);
    return refund;
  }
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }) { return hmacMatches(this.keySecret, `${input.orderId}|${input.paymentId}`, input.signature); }
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) { return hmacMatches(this.webhookSecret, rawBody, signature); }
  async listPayments() { return [...this.payments.values()].map(payment => ({ ...payment })); }
  async listRefunds() { return [...this.refunds.values()].map(refund => ({ ...refund })); }
}
