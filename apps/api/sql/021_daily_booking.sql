-- Per-day booking (photographers, event planners, decorators). A service is charged per hour ('hourly') or per day ('daily').
-- Forward-only and in one transaction (the runner wraps each file). The existing modes map one to one:
--   TIMED    -> hourly (duration and minute buffers, unchanged)
--   FULL_DAY -> daily with min_days = max_days = 1 and no buffer days: exactly the single whole local day it booked before.
-- The double-booking guard bookings_no_overlap is unchanged: it already compares tstzrange(block_start, block_end, '[)') per
-- vendor across every service, and a daily booking stores whole local days there, so daily and hourly bookings block each other.

-- Services ------------------------------------------------------------------------------------------------------------
ALTER TABLE services DROP CONSTRAINT services_booking_mode_check;
UPDATE services SET booking_mode = CASE booking_mode WHEN 'FULL_DAY' THEN 'daily' ELSE 'hourly' END;
ALTER TABLE services ALTER COLUMN booking_mode SET DEFAULT 'hourly';
ALTER TABLE services ADD CONSTRAINT services_booking_mode_check CHECK (booking_mode IN ('hourly', 'daily'));

ALTER TABLE services ADD COLUMN min_days integer, ADD COLUMN max_days integer, ADD COLUMN buffer_days integer;
-- Daily services do not use minutes. These columns were NOT NULL with defaults; for daily rows they held an unused default
-- (60 minutes, 0 buffers) that is cleared here so each mode carries exactly its own fields.
ALTER TABLE services ALTER COLUMN duration_minutes DROP NOT NULL, ALTER COLUMN buffer_before_minutes DROP NOT NULL, ALTER COLUMN buffer_after_minutes DROP NOT NULL;
UPDATE services SET duration_minutes = NULL, buffer_before_minutes = NULL, buffer_after_minutes = NULL, min_days = 1, max_days = 1, buffer_days = 0 WHERE booking_mode = 'daily';
ALTER TABLE services ADD CONSTRAINT services_mode_fields CHECK (
  (booking_mode = 'hourly' AND duration_minutes IS NOT NULL AND buffer_before_minutes IS NOT NULL AND buffer_after_minutes IS NOT NULL
     AND min_days IS NULL AND max_days IS NULL AND buffer_days IS NULL)
  OR
  (booking_mode = 'daily' AND duration_minutes IS NULL AND buffer_before_minutes IS NULL AND buffer_after_minutes IS NULL
     AND min_days BETWEEN 1 AND 30 AND max_days BETWEEN min_days AND 30 AND buffer_days BETWEEN 0 AND 7)
);

-- Bookings: the mode, the number of days and the vendor's timezone are frozen when the hold is created --------------------
ALTER TABLE bookings ADD COLUMN booking_mode text NOT NULL DEFAULT 'hourly' CHECK (booking_mode IN ('hourly', 'daily'));
ALTER TABLE bookings ADD COLUMN days_count integer;
ALTER TABLE bookings ADD COLUMN vendor_timezone text;
UPDATE bookings b SET vendor_timezone = v.timezone FROM vendors v WHERE v.id = b.vendor_id;
-- Bookings made with a FULL_DAY service span whole local days; mark exactly those as daily. Everything else stays hourly.
UPDATE bookings b SET booking_mode = 'daily',
  days_count = ((b.ends_at AT TIME ZONE b.vendor_timezone)::date - (b.starts_at AT TIME ZONE b.vendor_timezone)::date)
FROM services s
WHERE s.id = b.service_id AND s.booking_mode = 'daily'
  AND (b.starts_at AT TIME ZONE b.vendor_timezone)::time = '00:00' AND (b.ends_at AT TIME ZONE b.vendor_timezone)::time = '00:00'
  AND (b.ends_at AT TIME ZONE b.vendor_timezone)::date > (b.starts_at AT TIME ZONE b.vendor_timezone)::date;
ALTER TABLE bookings ALTER COLUMN vendor_timezone SET NOT NULL;
-- The app sets vendor_timezone itself; any other insert (seeds, fixtures) gets the vendor's current timezone.
CREATE OR REPLACE FUNCTION bookings_default_vendor_timezone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.vendor_timezone IS NULL THEN SELECT timezone INTO NEW.vendor_timezone FROM vendors WHERE id = NEW.vendor_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_default_vendor_timezone BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION bookings_default_vendor_timezone();
ALTER TABLE bookings ADD CONSTRAINT bookings_mode_days CHECK (
  (booking_mode = 'hourly' AND days_count IS NULL) OR (booking_mode = 'daily' AND days_count BETWEEN 1 AND 30)
);
