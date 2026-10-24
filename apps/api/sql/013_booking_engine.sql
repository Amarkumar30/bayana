-- Phase 5 booking engine. DESTRUCTIVE (column renames): back up before applying to a database with data.
-- Renames the booking time columns to the spec's names (SPEC 8.3), replaces the overlap guard with the spec's
-- constraint, scopes idempotency keys per vendor and makes booking_events append-only.

-- 1. Spec column names. The legacy local wall-clock column frees the name starts_at first.
ALTER TABLE bookings RENAME COLUMN starts_at TO local_start_time;
ALTER TABLE bookings RENAME COLUMN starts_at_utc TO starts_at;
ALTER TABLE bookings RENAME COLUMN ends_at_utc TO ends_at;
ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlapping_active_periods;
ALTER TABLE bookings DROP COLUMN occupied_range;
ALTER TABLE bookings RENAME COLUMN occupied_starts_at TO block_start;
ALTER TABLE bookings RENAME COLUMN occupied_ends_at TO block_end;
ALTER TABLE bookings DROP CONSTRAINT bookings_utc_range_check;
ALTER TABLE bookings DROP CONSTRAINT bookings_occupied_range_check;

-- 2. Legacy rows without service times take them from their block range; rows with neither were whole-day bookings
-- (the old per-day unique index), so they get the vendor-local day. Blocks then widen to contain the service time.
UPDATE bookings b
SET starts_at = COALESCE(b.starts_at, b.block_start, (b.event_date::timestamp) AT TIME ZONE v.timezone),
    ends_at = COALESCE(b.ends_at, b.block_end, ((b.event_date + 1)::timestamp) AT TIME ZONE v.timezone)
FROM vendors v
WHERE v.id = b.vendor_id AND (b.starts_at IS NULL OR b.ends_at IS NULL);
UPDATE bookings SET block_start = LEAST(COALESCE(block_start, starts_at), starts_at), block_end = GREATEST(COALESCE(block_end, ends_at), ends_at)
WHERE block_start IS NULL OR block_end IS NULL OR block_start > starts_at OR block_end < ends_at;
ALTER TABLE bookings ALTER COLUMN starts_at SET NOT NULL, ALTER COLUMN ends_at SET NOT NULL, ALTER COLUMN block_start SET NOT NULL, ALTER COLUMN block_end SET NOT NULL;

-- 3. The double-booking guard, exactly as SPEC 8.3 (statuses are stored upper case).
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (vendor_id WITH =, tstzrange(block_start, block_end, '[)') WITH &&) WHERE (status IN ('HELD','PENDING','CONFIRMED'));
ALTER TABLE bookings ADD CONSTRAINT bookings_block_valid CHECK (block_start <= starts_at AND starts_at < ends_at AND ends_at <= block_end);

-- 4. One booking per (vendor, idempotency key) (SPEC 8.4); a zero advance is allowed, never above the total.
ALTER TABLE bookings DROP CONSTRAINT bookings_idempotency_key_key;
ALTER TABLE bookings ADD CONSTRAINT bookings_vendor_idempotency_key UNIQUE (vendor_id, idempotency_key);
ALTER TABLE bookings DROP CONSTRAINT bookings_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_advance_check CHECK (advance_paise >= 0 AND advance_paise <= total_paise);
CREATE INDEX bookings_vendor_hold_expiry_idx ON bookings (vendor_id, hold_expires_at) WHERE status IN ('HELD','PENDING');

-- 5. Booking history cannot be rewritten. The runtime role gets no UPDATE/DELETE/TRUNCATE on booking_events, and a
-- trigger rejects them for every role (the local Docker user is a superuser, which ignores REVOKE).
ALTER TABLE booking_events ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;
-- clock_timestamp() so several events written in one transaction keep their order.
ALTER TABLE booking_events ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX booking_events_booking_idx ON booking_events (booking_id, created_at);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayana_app') THEN CREATE ROLE bayana_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO bayana_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bayana_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bayana_app;
REVOKE UPDATE, DELETE, TRUNCATE ON booking_events FROM bayana_app;
CREATE FUNCTION booking_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking_events is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER booking_events_no_rewrite BEFORE UPDATE OR DELETE ON booking_events FOR EACH ROW EXECUTE FUNCTION booking_events_append_only();
CREATE TRIGGER booking_events_no_truncate BEFORE TRUNCATE ON booking_events FOR EACH STATEMENT EXECUTE FUNCTION booking_events_append_only();
