ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS referral text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS access_token_hash text UNIQUE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('HELD','PENDING','CONFIRMED','COMPLETED','CANCELLED','EXPIRED','EXPIRED_PAID'));
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlapping_active_periods;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlapping_active_periods EXCLUDE USING gist (vendor_id WITH =, occupied_range WITH &&) WHERE (status IN ('HELD','PENDING','CONFIRMED','COMPLETED'));

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  recipient citext NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(next_attempt_at) WHERE sent_at IS NULL;
CREATE INDEX bookings_client_user_idx ON bookings(client_user_id,created_at DESC);
