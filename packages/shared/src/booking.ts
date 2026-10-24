import { formatINR, percentageOf } from "./money.js";
import type { CancellationTier } from "./vendor.js";

/** Cancellation tiers in plain words, used in the contract and on the booking pages. */
export function tiersInWords(tiers: CancellationTier[]) {
  if (!tiers.length) return "The advance is not refundable.";
  const sorted = [...tiers].sort((a, b) => b.min_hours_before - a.min_hours_before);
  return sorted.map(tier => `Cancel at least ${tier.min_hours_before} hours before the start: ${tier.refund_percent}% of the advance is refunded.`).join(" ")
    + (sorted.at(-1)?.min_hours_before ? ` Later than ${sorted.at(-1)?.min_hours_before} hours before the start: no refund.` : "");
}

/**
 * Refund for cancelling now under the snapshotted tiers: the first tier whose notice is met applies, else nothing.
 * Uses the same round-half-up integer rule as advances, and never refunds more than was paid.
 */
export function refundPreview(paidPaise: number, tiers: CancellationTier[], startsAt: Date, now = new Date()) {
  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const tier = [...tiers].sort((a, b) => b.min_hours_before - a.min_hours_before).find(value => hoursBefore >= value.min_hours_before);
  const percent = hoursBefore > 0 ? tier?.refund_percent ?? 0 : 0;
  return { refund_percent: percent, refund_paise: Math.min(paidPaise, percentageOf(paidPaise, percent)), paid_paise: paidPaise };
}
export const describeRefund = (preview: ReturnType<typeof refundPreview>) =>
  preview.paid_paise === 0 ? "Nothing has been paid yet, so there is nothing to refund." : preview.refund_paise === 0 ? `Your advance of ${formatINR(preview.paid_paise)} is not refunded at this point.` : `${formatINR(preview.refund_paise)} of your ${formatINR(preview.paid_paise)} advance will be refunded (${preview.refund_percent}%).`;

/** One human sentence per booking error code, shared by web and email (SPEC 5.6). */
export const bookingErrorCopy: Record<string, string> = {
  SLOT_TAKEN: "This time was just booked by someone else. Pick another time below.",
  HOLD_EXPIRED: "Your 15-minute hold ran out, so the time was released. Choose a time again to continue.",
  OTP_INVALID: "That code is wrong or has expired. Check the latest email, or request a new code.",
  TERMS_CHANGED: "The business updated its terms a moment ago. Please read them again and agree to continue.",
  IDEMPOTENCY_KEY_REUSED: "This booking request was already sent with different details. Start again from the time you want.",
  SERVICE_UNAVAILABLE: "This service is no longer offered. Go back and choose another service.",
  PHONE_REQUIRED: "This business needs a phone number to confirm bookings. Add one and try again."
};
