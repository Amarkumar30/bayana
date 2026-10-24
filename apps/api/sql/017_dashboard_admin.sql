-- Phase 9 vendor dashboard and admin (SPEC 4.4 BK-09..13, 4.8 AD, 5.3, 5.4, AU-10). Additive only.

-- 1. Admin access: the flag is set only with SQL (SPEC 3), plus a TOTP second factor per session (AU-10).
ALTER TABLE users
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_secret_enc text CHECK (char_length(totp_secret_enc) <= 200),
  ADD COLUMN totp_enabled_at timestamptz,
  ADD COLUMN totp_last_step bigint,
  ADD COLUMN deleted_at timestamptz;
ALTER TABLE sessions ADD COLUMN second_factor_at timestamptz;

-- 2. Vendor settings: calendar feed secret (only its hash) and which emails the vendor wants.
ALTER TABLE vendors
  ADD COLUMN ical_token_hash text UNIQUE,
  ADD COLUMN notify_prefs jsonb NOT NULL DEFAULT '{"booking_confirmed": true, "booking_cancelled": true, "reminder_24h": true}'::jsonb;

-- 3. New email for a moved booking.
ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_template_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_template_check CHECK (template IN ('legacy', 'otp', 'hold_started', 'booking_request_vendor', 'booking_confirmed_customer', 'booking_confirmed_vendor', 'booking_cancelled', 'refund_issued', 'reminder_24h', 'payment_review', 'payment_recorded', 'booking_rescheduled'));

-- 4. Lists the dashboard and the admin console read.
CREATE INDEX bookings_vendor_starts_idx ON bookings (vendor_id, starts_at);
CREATE INDEX bookings_client_email_idx ON bookings (client_email);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
