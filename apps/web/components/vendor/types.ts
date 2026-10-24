import type { CancellationTier } from "@bayana/shared";

export type AdvanceType = "NONE" | "PERCENT" | "FIXED";
export type Service = {
  id: string; name: string; description: string; price_paise: string | number; duration_minutes: number; buffer_before_minutes: number; buffer_after_minutes: number;
  booking_mode: "TIMED" | "FULL_DAY"; advance_type: AdvanceType; advance_value: number; cancellation_tiers: CancellationTier[]; terms_template: string; customer_details_prompt: string; active: boolean; sort_order: number;
};
export type Profile = {
  id: string; slug: string; business_name: string; description: string; city: string; service_area: string | null; timezone: string; terms: string; cancellation_policy: string; rescheduling_policy: string;
  phone_required: boolean; public_contact_email: boolean; public_contact_phone: boolean; published: boolean; min_notice_minutes: number; max_advance_days: number; categories: string[]; services: Service[];
};
export type Checklist = { published: boolean; steps: { key: string; label: string; done: boolean }[]; missing: string[] };
export const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const categories = [["photography", "Photography"], ["beauty-and-salon", "Beauty and salon"], ["tutoring", "Tutoring"], ["coaching-and-consulting", "Coaching and consulting"], ["fitness", "Fitness"], ["events", "Events"], ["repair-and-maintenance", "Repair and maintenance"], ["other", "Other"]] as const;
export const timezones = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
