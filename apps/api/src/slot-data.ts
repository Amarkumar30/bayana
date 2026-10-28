import type { Pool, PoolClient } from "pg";
import type { AvailabilityOverride, BusyPeriod, LocalInterval, SlotEngineInput } from "./availability.js";

export const SLOT_STEP_MINUTES = 30;

/** Loads everything the pure slot engine needs for one vendor and service. Null when the service is not an active service of that vendor. */
export async function loadSlotEngineInput(db: Pool | PoolClient, vendorId: string, serviceId: string, now = new Date()): Promise<SlotEngineInput | null> {
  const [vendor, service, rules, overrides, blocked, bookings] = await Promise.all([
    db.query<{ timezone: string; min_notice_minutes: number; max_advance_days: number }>("SELECT timezone,min_notice_minutes,max_advance_days FROM vendors WHERE id=$1", [vendorId]),
    db.query<{ duration_minutes: number | null; buffer_before_minutes: number | null; buffer_after_minutes: number | null; booking_mode: "hourly" | "daily"; min_days: number | null; max_days: number | null; buffer_days: number | null; min_blocks: number | null; max_blocks: number | null }>("SELECT duration_minutes,buffer_before_minutes,buffer_after_minutes,booking_mode,min_days,max_days,buffer_days,min_blocks,max_blocks FROM services WHERE id=$1 AND vendor_id=$2 AND active", [serviceId, vendorId]),
    db.query<{ weekday: number; start_time: string; end_time: string }>("SELECT weekday,start_time::text,end_time::text FROM availability_rules WHERE vendor_id=$1 ORDER BY weekday,start_time", [vendorId]),
    db.query<{ local_date: string; kind: "block" | "open"; start_time: string | null; end_time: string | null }>("SELECT local_date::text,kind,start_time::text,end_time::text FROM availability_overrides WHERE vendor_id=$1 AND local_date >= current_date - 1", [vendorId]),
    db.query<BusyPeriod>("SELECT starts_at::text AS \"startsAt\",ends_at::text AS \"endsAt\" FROM blocked_periods WHERE vendor_id=$1 AND ends_at>now()", [vendorId]),
    db.query<BusyPeriod>("SELECT block_start::text AS \"startsAt\",block_end::text AS \"endsAt\" FROM bookings WHERE vendor_id=$1 AND status IN ('HELD','PENDING','CONFIRMED') AND (status='CONFIRMED' OR hold_expires_at>now()) AND block_end>now()", [vendorId])
  ]);
  if (!vendor.rowCount || !service.rowCount) return null;
  const weeklyRules = new Map<number, LocalInterval[]>();
  for (const rule of rules.rows) weeklyRules.set(rule.weekday, [...(weeklyRules.get(rule.weekday) ?? []), { startTime: rule.start_time, endTime: rule.end_time }]);
  const v = vendor.rows[0], s = service.rows[0];
  return {
    timezone: v.timezone, serviceDurationMinutes: s.duration_minutes ?? 0, blocks: s.booking_mode === "hourly" ? { minBlocks: s.min_blocks ?? 1, maxBlocks: s.max_blocks ?? 1 } : null, bufferBeforeMinutes: s.buffer_before_minutes ?? 0, bufferAfterMinutes: s.buffer_after_minutes ?? 0, bookingMode: s.booking_mode,
    daily: s.booking_mode === "daily" ? { minDays: s.min_days ?? 1, maxDays: s.max_days ?? 1, bufferDays: s.buffer_days ?? 0 } : null,
    slotStepMinutes: SLOT_STEP_MINUTES, minimumNoticeMinutes: v.min_notice_minutes, maximumDaysAhead: v.max_advance_days, weeklyRules,
    overrides: overrides.rows.map((row): AvailabilityOverride => ({ localDate: row.local_date, kind: row.kind, startTime: row.start_time, endTime: row.end_time })),
    blockedPeriods: blocked.rows, activeBookings: bookings.rows, now
  };
}
