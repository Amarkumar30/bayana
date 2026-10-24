import type { BookingView } from "@/components/booking/types";

// Shapes of the vendor dashboard API (apps/api/src/dashboard-routes.ts).

export type BookingRow = { id: string; status: string; service_name: string | null; client_name: string; client_email?: string; starts_at: string; ends_at: string; total_paise: number; paid_paise: number };
export type TodoKind = "record_advance" | "mark_complete" | "return_money" | "refund_failed";
export type Overview = {
  timezone: string; upcoming: BookingRow[]; payments_enabled: boolean; published: boolean; publish_missing: string[];
  money: { collected_30d_paise: number; balance_due_paise: number };
  todo: { kind: TodoKind; id: string; client_name: string; starts_at: string; amount_paise: number | null }[];
};
export type BookingList = { timezone: string; bookings: BookingRow[]; page: number; has_more: boolean };
export type BookingEvent = { from_status: string | null; to_status: string; actor: string; reason: string | null; meta: Record<string, unknown>; created_at: string };
export type BookingDetail = BookingView & {
  customer: { name: string; email: string; phone: string; notes: string | null; referral: string | null }; created_at: string;
  events: BookingEvent[]; ledger: { kind: string; amount_paise: number; channel: string; actor: string; reason: string; created_at: string }[];
  actions: { cancel: boolean; complete: boolean; reschedule: boolean; record_payment: boolean };
};
export type CalendarData = { timezone: string; from: string; to: string; bookings: Omit<BookingRow, "total_paise" | "paid_paise">[]; blocked_periods: { id: string; starts_at: string; ends_at: string; reason: string }[] };
export type PaymentsData = {
  timezone: string;
  summary: { received_paise: number; online_paise: number; offline_paise: number; refunded_paise: number; owed_by_you_paise: number; balance_due_paise: number };
  payout: { mode: "razorpay_direct" | "offline_only" };
  payments: { id: string; booking_id: string; provider: "razorpay" | "offline"; kind: string; status: string; amount_paise: number; method: string | null; created_at: string; verified_at: string | null; client_name: string; service_name: string | null }[];
  refunds: { id: string; booking_id: string; amount_paise: number; status: string; reason: string; created_at: string; processed_at: string | null; client_name: string }[];
  balances_due: { id: string; client_name: string; service_name: string | null; starts_at: string; status: string; balance_due_paise: number }[];
};
export type Customer = { email: string; name: string; phone: string | null; bookings: number; paid_paise: number; last_starts_at: string; history: { id: string; status: string; service_name: string | null; starts_at: string; total_paise: number }[] };
export type Settings = { notify_prefs: { booking_confirmed: boolean; booking_cancelled: boolean; reminder_24h: boolean }; ical_enabled: boolean; account_email: string };
