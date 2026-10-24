-- 008's GiST exclusion constraint has direct-SQL coverage.  These legacy
-- date/time equality indexes would otherwise prevent non-overlapping timed
-- bookings on the same vendor day.
DROP INDEX IF EXISTS one_active_booking_per_vendor_day;
DROP INDEX IF EXISTS one_active_booking_per_vendor_slot;
