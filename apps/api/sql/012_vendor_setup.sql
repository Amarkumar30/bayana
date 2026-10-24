-- Phase 4 vendor setup: expand-only. availability_exceptions is copied into availability_overrides and left unused
-- for a later contract migration (after a backup).

-- Booking window: how soon and how far ahead customers may book, per vendor.
ALTER TABLE vendors ADD COLUMN min_notice_minutes integer NOT NULL DEFAULT 120 CHECK (min_notice_minutes BETWEEN 0 AND 43200);
ALTER TABLE vendors ADD COLUMN max_advance_days integer NOT NULL DEFAULT 90 CHECK (max_advance_days BETWEEN 1 AND 365);

-- Per-service terms (a template rendered with booking values later) and cancellation tiers (validated by Zod in @bayana/shared).
ALTER TABLE services ADD COLUMN terms_template text NOT NULL DEFAULT '' CHECK (char_length(terms_template) <= 10000);
ALTER TABLE services ADD COLUMN cancellation_tiers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cancellation_tiers) = 'array');
-- A fixed advance may never exceed the price. NOT VALID: enforced for new and updated rows without failing on any legacy row.
ALTER TABLE services ADD CONSTRAINT services_fixed_advance_within_price CHECK (advance_type <> 'FIXED' OR advance_value <= price_paise) NOT VALID;

-- Date overrides (SPEC 8.2 availability_overrides). For a date: a whole-day block clears the weekly windows, open windows
-- are then added, and partial blocks are cut out. "Replace this day's hours" = whole-day block + open window.
CREATE TABLE availability_overrides (
  id uuid PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('block', 'open')),
  start_time time,
  end_time time,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)),
  CHECK (kind = 'block' OR start_time IS NOT NULL)
);
CREATE INDEX availability_overrides_vendor_date_idx ON availability_overrides(vendor_id, local_date);

-- Closed days become whole-day blocks; custom-hours days (which replaced the weekly hours) become block + open.
INSERT INTO availability_overrides(id, vendor_id, local_date, kind)
SELECT gen_random_uuid(), vendor_id, local_date, 'block' FROM availability_exceptions;
INSERT INTO availability_overrides(id, vendor_id, local_date, kind, start_time, end_time)
SELECT gen_random_uuid(), vendor_id, local_date, 'open', start_time, end_time FROM availability_exceptions WHERE NOT is_closed;
