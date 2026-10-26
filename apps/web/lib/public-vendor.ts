import type { CancellationTier } from "@bayana/shared";
import { env } from "@/env";

export type PublicService = { id: string; name: string; description: string; price_paise: string; duration_minutes: number | null; booking_mode: "hourly" | "daily"; min_days: number | null; max_days: number | null; buffer_days: number | null; advance_type: "NONE" | "PERCENT" | "FIXED"; advance_value: number; advance_paise: number; remaining_paise: number; cancellation_tiers: CancellationTier[] };
export type PublicVendor = {
  slug: string; canonical_slug: string; display_name: string; city: string; bio: string; service_area: string | null; timezone: string; categories: string[];
  terms: string; cancellation_policy: string; rescheduling_policy: string; phone_required: boolean; payments_enabled: boolean;
  contact_email: string | null; contact_phone: string | null; services: PublicService[];
};

/** Seconds a vendor page stays cached. While the API sleeps, visitors get the cached page (SPEC 16.6). */
export const VENDOR_PAGE_REVALIDATE = 300;

/** Server-side read for the cached public page. Null means "not published" (the API's single 404); anything else failing throws so ISR keeps the last good page. */
export async function fetchPublicVendor(slug: string): Promise<PublicVendor | null> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/vendors/${encodeURIComponent(slug)}`, { next: { revalidate: VENDOR_PAGE_REVALIDATE, tags: [`vendor:${slug}`] }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Vendor page unavailable (HTTP ${response.status})`);
  return await response.json() as PublicVendor;
}
