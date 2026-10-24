import type { CancellationTier } from "@bayana/shared";

/** GET /v1/bookings/:id (apps/api/src/booking-routes.ts). */
export type BookingView = {
  id: string; status: string; service_name: string | null; duration_minutes: number | null; starts_at: string; ends_at: string; hold_expires_at: string | null; timezone: string;
  vendor: { slug: string; display_name: string }; client_name: string;
  total_paise: number; advance_paise: number; paid_paise: number; balance_due_paise: number; payments_enabled: boolean; viewer: "customer" | "vendor";
  timeline: { to_status: string; created_at: string }[];
  payments: { id: string; status: string; amount_paise: string; created_at: string }[];
  contract: { body: string; sha256: string; accepted_at: string } | null;
  contract_preview: { body: string; sha256: string } | null;
  cancellation_tiers: CancellationTier[];
  can_cancel: boolean;
  refund_preview: { refund_paise: number; refund_percent: number; paid_paise: number } | null;
};
export type Checkout = { key_id: string; order_id: string; amount_paise: number; currency: string };
/** The private link header: the token never goes into a URL the API logs. */
export const tokenHeaders = (token?: string | null): Record<string, string> => token ? { "X-Booking-Token": token } : {};
export const bookingPageHref = (id: string, token?: string | null) => `/b/${id}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
