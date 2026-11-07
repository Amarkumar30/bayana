import type { CancellationTier } from "./vendor.js";

const days = (count: number) => count * 24;
const TERMS = "Your booking is confirmed once the advance is received. The balance is due on the day, before the service starts, unless we agree otherwise in writing.";
const ONE_MOVE = "You can move your booking once, free of charge, with at least 48 hours' notice, if the new time is free.";

/**
 * The three cancellation rules a vendor starts from, counted in days before the first booked day. Each is the refund tiers on the
 * service and the same rule in words for the vendor's policies, so the two cannot disagree. Templates default to Moderate.
 */
export const cancellationPresets = [
  { key: "flexible", label: "Flexible", summary: "100% at 30+ days, 50% at 15 to 29 days, 0% under 15 days.", tiers: [{ min_hours_before: days(30), refund_percent: 100 }, { min_hours_before: days(15), refund_percent: 50 }] as CancellationTier[],
    policies: { terms: TERMS, cancellation_policy: "Cancel 30 days or more before the first booked day: the advance is refunded in full. Cancel 15 to 29 days before: 50% of the advance is refunded. Cancel less than 15 days before: the advance is not refunded.", rescheduling_policy: ONE_MOVE } },
  { key: "moderate", label: "Moderate", summary: "50% at 30+ days, 25% at 15 to 29 days, 0% under 15 days.", tiers: [{ min_hours_before: days(30), refund_percent: 50 }, { min_hours_before: days(15), refund_percent: 25 }] as CancellationTier[],
    policies: { terms: TERMS, cancellation_policy: "Cancel 30 days or more before the first booked day: 50% of the advance is refunded. Cancel 15 to 29 days before: 25% of the advance is refunded. Cancel less than 15 days before: the advance is not refunded.", rescheduling_policy: ONE_MOVE } },
  { key: "strict", label: "Strict", summary: "No refund. One date change if the new date is free.", tiers: [] as CancellationTier[],
    policies: { terms: TERMS, cancellation_policy: "The advance is not refunded if you cancel.", rescheduling_policy: "You can change your date once, if the new date is free." } }
];
export type CancellationPreset = (typeof cancellationPresets)[number];
export const defaultPreset = cancellationPresets[1];
/** The preset these tiers are, if they are exactly one. */
export const presetForTiers = (tiers: CancellationTier[]) => cancellationPresets.find(preset => preset.tiers.length === tiers.length && preset.tiers.every((tier, index) => tier.min_hours_before === tiers[index].min_hours_before && tier.refund_percent === tiers[index].refund_percent));

/** A starting point for a vendor's first service. Prices are examples; every value is theirs to edit, and the server's rules are unchanged. */
export type ServiceTemplate = { key: string; label: string; hint: string; name: string; description: string; pricePaise: number | null; mode: "hourly" | "daily"; durationMinutes: number; minDays: number; maxDays: number; advancePercent: number };
export const serviceTemplates: ServiceTemplate[] = [
  { key: "wedding", label: "Wedding photography", hint: "Full day. Example price: ₹45,000 a day", name: "Wedding photography, full day", description: "Full-day coverage of your wedding, with edited photos delivered after the event.", pricePaise: 45_000_00, mode: "daily", durationMinutes: 60, minDays: 1, maxDays: 3, advancePercent: 30 },
  { key: "pre-wedding", label: "Pre-wedding shoot", hint: "2-hour session. Example price: ₹15,000", name: "Pre-wedding shoot, 2 hours", description: "A relaxed two-hour couple shoot at a location of your choice.", pricePaise: 15_000_00, mode: "hourly", durationMinutes: 120, minDays: 1, maxDays: 1, advancePercent: 25 },
  { key: "event", label: "Event", hint: "Per day. Example price: ₹30,000 a day", name: "Event coverage", description: "Coverage of your event for the whole day: birthdays, anniversaries, launches and more.", pricePaise: 30_000_00, mode: "daily", durationMinutes: 60, minDays: 1, maxDays: 2, advancePercent: 30 },
  { key: "blank", label: "Start blank", hint: "Fill it in yourself", name: "", description: "", pricePaise: null, mode: "hourly", durationMinutes: 60, minDays: 1, maxDays: 1, advancePercent: 25 }
];
