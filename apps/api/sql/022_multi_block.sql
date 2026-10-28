-- Multi-session (multi-block) booking for hourly services. One hourly booking is one continuous range of 1 to 12 consecutive
-- sessions ("blocks") of the service's duration_minutes on one local day; the price stays the price of one session.
-- Forward-only and in one transaction (the runner wraps each file). Nothing is dropped or renamed. Existing services become
-- min_blocks = max_blocks = 1 and existing hourly bookings blocks_count = 1, so their behaviour, times and prices are unchanged.
-- The double-booking guard bookings_no_overlap is unchanged: a multi-session booking stores its whole range (plus its buffers,
-- once) in block_start/block_end, which the constraint already compares per vendor.

-- Services ------------------------------------------------------------------------------------------------------------
ALTER TABLE services ADD COLUMN min_blocks integer, ADD COLUMN max_blocks integer;
UPDATE services SET min_blocks = 1, max_blocks = 1 WHERE booking_mode = 'hourly';
-- Hourly: 1 <= min <= max <= 12, and the longest booking still fits inside one local day. Daily: not used.
ALTER TABLE services ADD CONSTRAINT services_blocks CHECK (
  (booking_mode = 'hourly' AND min_blocks >= 1 AND max_blocks >= min_blocks AND max_blocks <= 12 AND duration_minutes * max_blocks <= 1440)
  OR
  (booking_mode = 'daily' AND min_blocks IS NULL AND max_blocks IS NULL)
);
-- The app always sets both; any other insert of an hourly service (seeds, fixtures) books exactly one session, as before.
CREATE OR REPLACE FUNCTION services_default_blocks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.booking_mode = 'hourly' THEN
    NEW.min_blocks := COALESCE(NEW.min_blocks, 1);
    NEW.max_blocks := COALESCE(NEW.max_blocks, GREATEST(NEW.min_blocks, 1));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER services_default_blocks BEFORE INSERT ON services FOR EACH ROW EXECUTE FUNCTION services_default_blocks();

-- Bookings: the number of sessions and the session length are frozen when the hold is created -------------------------
ALTER TABLE bookings ADD COLUMN blocks_count integer, ADD COLUMN block_minutes integer;
-- Every existing hourly booking is one session; its session length is the snapshotted duration, or its stored length.
UPDATE bookings SET blocks_count = 1,
  block_minutes = COALESCE(duration_minutes, GREATEST(1, round(extract(epoch FROM ends_at - starts_at) / 60)::integer))
WHERE booking_mode = 'hourly';
ALTER TABLE bookings ADD CONSTRAINT bookings_blocks CHECK (
  (booking_mode = 'hourly' AND blocks_count BETWEEN 1 AND 12 AND block_minutes >= 1)
  OR
  (booking_mode = 'daily' AND blocks_count IS NULL AND block_minutes IS NULL)
);
CREATE OR REPLACE FUNCTION bookings_default_blocks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.booking_mode = 'hourly' THEN
    NEW.blocks_count := COALESCE(NEW.blocks_count, 1);
    NEW.block_minutes := COALESCE(NEW.block_minutes, NEW.duration_minutes, GREATEST(1, round(extract(epoch FROM NEW.ends_at - NEW.starts_at) / 60)::integer));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_default_blocks BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION bookings_default_blocks();
