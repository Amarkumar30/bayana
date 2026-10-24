import { config } from "../config.js";
import { AppError } from "../errors.js";
import { FakeProvider } from "./fake-provider.js";
import type { PaymentProvider } from "./provider.js";
import { RazorpayProvider } from "./razorpay-provider.js";

export type PaymentMode = "disabled" | "test" | "live";
let override: { mode: PaymentMode; provider: PaymentProvider | null } | null = null;
let configured: PaymentProvider | null = null;

/** The mode in force. Integration tests may switch it with useTestPayments(); nothing else can. */
export const paymentMode = (): PaymentMode => override?.mode ?? config.PAYMENT_MODE;
export const paymentsEnabled = () => paymentMode() !== "disabled";

/** The gateway for this process. Live mode is refused outright until the go-live gates (SPEC 16.8) are cleared. */
export function paymentProvider(): PaymentProvider {
  const mode = paymentMode();
  if (mode === "disabled") throw new AppError(409, "PAYMENT_DISABLED", "Online payment is not switched on for this business");
  if (mode === "live") throw new AppError(409, "PAYMENT_LIVE_REFUSED", "Live payments are not enabled in this build");
  if (override) { if (!override.provider) throw new AppError(409, "PAYMENTS_NOT_CONFIGURED", "Payments are not configured"); return override.provider; }
  if (!configured) {
    if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) throw new AppError(409, "PAYMENTS_NOT_CONFIGURED", "Payments are not configured");
    configured = config.PAYMENT_PROVIDER === "fake"
      ? new FakeProvider(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET, config.RAZORPAY_WEBHOOK_SECRET ?? undefined)
      : new RazorpayProvider(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET, config.RAZORPAY_WEBHOOK_SECRET);
  }
  return configured;
}

/** Test hook (NODE_ENV=test only): run with a given mode and provider, or reset with null. */
export function useTestPayments(next: { mode: PaymentMode; provider: PaymentProvider | null } | null) {
  if (config.NODE_ENV !== "test") throw new Error("useTestPayments is for tests only");
  override = next;
}
