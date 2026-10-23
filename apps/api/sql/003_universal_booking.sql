-- Forward-only extension of the original photography schema.  The legacy table
-- name is retained so existing installations and bookings remain intact.
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS contact_email citext;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS terms text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS cancellation_policy text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS rescheduling_policy text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS phone_required boolean NOT NULL DEFAULT true;
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT true;

CREATE TABLE services (
  id uuid PRIMARY KEY, photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '', price_paise bigint NOT NULL CHECK (price_paise > 0),
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 1440),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_public_idx ON services(photographer_id) WHERE active;

CREATE TABLE availability_slots (
  id uuid PRIMARY KEY, photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  event_date date NOT NULL, starts_at time NOT NULL, ends_at time NOT NULL,
  state text NOT NULL CHECK (state IN ('AVAILABLE','BLOCKED')),
  CHECK (ends_at > starts_at), UNIQUE(photographer_id,event_date,starts_at)
);
CREATE INDEX availability_slots_date_idx ON availability_slots(photographer_id,event_date);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS starts_at time;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_slot ON bookings(photographer_id,event_date,starts_at) WHERE starts_at IS NOT NULL AND status IN ('HELD','CONFIRMED','COMPLETED');
