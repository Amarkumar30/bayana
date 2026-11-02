-- Private "View your booking" links for every booking email (hold, confirmed, cancelled, rescheduled, refund, reminder).
-- bookings.access_token_hash keeps the first link (sent with the hold). A token is stored only as a hash, so a later email
-- cannot reuse it: each email gets its own long random token, and only its hash is kept here. Any one of them opens that one
-- booking, read-only for whoever holds it; revoked_at turns a link off (for example when a customer erases their data).
-- Forward-only and in one transaction (the runner wraps each file). Additive: nothing existing is changed, dropped or renamed.

CREATE TABLE booking_access_tokens (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX booking_access_tokens_booking_idx ON booking_access_tokens(booking_id);
