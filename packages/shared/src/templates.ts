import type { CancellationTier } from "./vendor.js";

/**
 * The Moderate cancellation rule: a full refund of the advance from 7 days before the start, half from 2 days before, nothing
 * after. New vendors start on it (tiers on the service, the same rule in words in their policies) and can change either.
 */
export const MODERATE_TIERS: CancellationTier[] = [{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }];
export const MODERATE_POLICIES = {
  terms: "Your booking is confirmed once the advance is received. The balance is due on the day, before the service starts, unless we agree otherwise in writing.",
  cancellation_policy: "Cancel 7 days or more before the start: the advance is refunded in full. Cancel 2 to 7 days before: 50% of the advance is refunded. Cancel less than 2 days before: the advance is not refunded.",
  rescheduling_policy: "You can move your booking once, free of charge, with at least 48 hours' notice, if the new time is free."
};

/** A starting point for a vendor's first service. Every value is theirs to edit before publishing; the server's rules are unchanged. */
export type ServiceTemplate = { key: string; label: string; hint: string; name: string; description: string; pricePaise: number | null; mode: "hourly" | "daily"; durationMinutes: number; minDays: number; maxDays: number; advancePercent: number };
export const serviceTemplates: ServiceTemplate[] = [
  { key: "wedding", label: "Wedding photography", hint: "Full day, charged per day", name: "Wedding photography, full day", description: "Full-day coverage of your wedding, with edited photos delivered after the event.", pricePaise: 45_000_00, mode: "daily", durationMinutes: 60, minDays: 1, maxDays: 3, advancePercent: 30 },
  { key: "pre-wedding", label: "Pre-wedding shoot", hint: "2-hour session", name: "Pre-wedding shoot, 2 hours", description: "A relaxed two-hour couple shoot at a location of your choice.", pricePaise: 15_000_00, mode: "hourly", durationMinutes: 120, minDays: 1, maxDays: 1, advancePercent: 25 },
  { key: "event", label: "Event", hint: "Charged per day", name: "Event coverage", description: "Coverage of your event for the whole day: birthdays, anniversaries, launches and more.", pricePaise: 30_000_00, mode: "daily", durationMinutes: 60, minDays: 1, maxDays: 2, advancePercent: 30 },
  { key: "blank", label: "Start blank", hint: "Fill it in yourself", name: "", description: "", pricePaise: null, mode: "hourly", durationMinutes: 60, minDays: 1, maxDays: 1, advancePercent: 25 }
];
