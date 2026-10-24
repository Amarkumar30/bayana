CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE availability_rules (
  id uuid PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX availability_rules_vendor_weekday_idx ON availability_rules(vendor_id, weekday, start_time);

CREATE TABLE availability_exceptions (
  id uuid PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  CHECK ((is_closed AND start_time IS NULL AND end_time IS NULL) OR (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);
CREATE INDEX availability_exceptions_vendor_date_idx ON availability_exceptions(vendor_id, local_date);

CREATE TABLE blocked_periods (
  id uuid PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  CHECK (ends_at > starts_at)
);
CREATE INDEX blocked_periods_vendor_range_idx ON blocked_periods(vendor_id, starts_at, ends_at);

-- `starts_at` was introduced as a local `time` in 003.  Keep it for legacy
-- display compatibility and add explicit UTC instants instead of renaming a
-- populated column.  Legacy timed rows are backfilled only when all inputs
-- needed to derive an unambiguous interval are present; the old day index
-- remains in force for every other legacy active booking.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS starts_at_utc timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ends_at_utc timestamptz;
ALTER TABLE bookings ADD COLUMN occupied_starts_at timestamptz;
ALTER TABLE bookings ADD COLUMN occupied_ends_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_price_paise bigint;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_advance_type text CHECK (service_advance_type IN ('NONE','PERCENT','FIXED'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_advance_value integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buffer_before_minutes integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buffer_after_minutes integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_snapshot text;

UPDATE bookings b
SET starts_at_utc = (b.event_date + b.starts_at) AT TIME ZONE v.timezone,
    ends_at_utc = ((b.event_date + b.starts_at) AT TIME ZONE v.timezone) + make_interval(mins => b.duration_minutes),
    occupied_starts_at = ((b.event_date + b.starts_at) AT TIME ZONE v.timezone),
    occupied_ends_at = ((b.event_date + b.starts_at) AT TIME ZONE v.timezone) + make_interval(mins => b.duration_minutes)
FROM vendors v
WHERE v.id = b.vendor_id
  AND b.starts_at IS NOT NULL
  AND b.duration_minutes IS NOT NULL
  AND b.starts_at_utc IS NULL;
ALTER TABLE bookings ADD COLUMN occupied_range tstzrange GENERATED ALWAYS AS (CASE WHEN occupied_starts_at IS NULL OR occupied_ends_at IS NULL THEN NULL ELSE tstzrange(occupied_starts_at, occupied_ends_at, '[)') END) STORED;
ALTER TABLE bookings ADD CONSTRAINT bookings_utc_range_check CHECK (ends_at_utc IS NULL OR starts_at_utc IS NOT NULL AND ends_at_utc > starts_at_utc);
ALTER TABLE bookings ADD CONSTRAINT bookings_occupied_range_check CHECK (occupied_ends_at IS NULL OR occupied_starts_at IS NOT NULL AND occupied_ends_at > occupied_starts_at);
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlapping_active_periods EXCLUDE USING gist (vendor_id WITH =, occupied_range WITH &&) WHERE (status IN ('HELD','CONFIRMED','COMPLETED'));
CREATE INDEX bookings_vendor_active_range_idx ON bookings USING gist (vendor_id, occupied_range) WHERE status IN ('HELD','CONFIRMED','COMPLETED');
