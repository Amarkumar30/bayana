import type { CancellationTier } from "@bayana/shared";
import type { DailyFields } from "./time";

/** GET /v1/bookings/:id (apps/api/src/booking-routes.ts). */
export type BookingView = DailyFields & {
  id: string; status: string; service_name: string | null; duration_minutes: number | null; starts_at: string; ends_at: string; hold_expires_at: string | null; timezone: string;
  vendor: { slug: string; display_name: string }; client_name: string;
  total_paise: number; advance_paise: number; paid_paise: number; balance_due_paise: number; payments_enabled: boolean; viewer: "customer" | "vendor";
  timeline: { to_status: string; created_at: string }[];
  payments: { id: string; provider: "razorpay" | "offline"; kind: "advance" | "balance"; status: string; amount_paise: number; method: string | null; note: string | null; created_at: string; verified_at: string | null; receipt: boolean }[];
  refunds: { id: string; payment_id: string; amount_paise: number; status: "pending" | "processed" | "failed" | "manual"; reason: string; created_at: string }[];
  can_pay: boolean;
  contract: { body: string; sha256: string; accepted_at: string } | null;
  contract_preview: { body: string; sha256: string } | null;
  cancellation_tiers: CancellationTier[];
  can_cancel: boolean;
  refund_preview: { refund_paise: number; refund_percent: number; paid_paise: number } | null;
};
/** The private link travels in a header; only receipt downloads (plain links) put it in the query string, which the API never logs. */
export const tokenHeaders = (token?: string | null): Record<string, string> => token ? { "X-Booking-Token": token } : {};
export const bookingPageHref = (id: string, token?: string | null) => `/b/${id}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
