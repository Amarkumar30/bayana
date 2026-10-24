-- Phase 8 notifications and jobs (SPEC 15). Additive only.

-- 1. The outbox carries every email: rendered at enqueue time inside the business transaction, sent by the tick.
ALTER TABLE email_outbox ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE email_outbox
  ADD COLUMN template text NOT NULL DEFAULT 'legacy' CHECK (template IN ('legacy', 'otp', 'hold_started', 'booking_request_vendor', 'booking_confirmed_customer', 'booking_confirmed_vendor', 'booking_cancelled', 'refund_issued', 'reminder_24h', 'payment_review', 'payment_recorded')),
  ADD COLUMN priority smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 9),
  ADD COLUMN status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  ADD COLUMN sender_name text CHECK (char_length(sender_name) <= 120),
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN dedupe_key text UNIQUE CHECK (char_length(dedupe_key) <= 200),
  ADD COLUMN failed_at timestamptz,
  ADD COLUMN body_purged_at timestamptz;
UPDATE email_outbox SET status = 'sent' WHERE sent_at IS NOT NULL;
DROP INDEX IF EXISTS email_outbox_pending_idx;
CREATE INDEX email_outbox_due_idx ON email_outbox (priority, next_attempt_at) WHERE status = 'queued';

-- 2. Reminder guard: a booking gets its 24-hour reminder once, however many ticks overlap (SPEC 15.3).
ALTER TABLE bookings ADD COLUMN reminder_sent_at timestamptz;
CREATE INDEX bookings_reminder_due_idx ON bookings (starts_at) WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL;

-- 3. One row per job run, for "did the tick run, and what did it do?".
CREATE TABLE job_runs (
  id uuid PRIMARY KEY,
  job text NOT NULL CHECK (job IN ('expire_holds', 'send_outbox', 'send_reminders', 'process_webhooks', 'reconcile_payments', 'cleanup', 'consistency_check')),
  trigger text NOT NULL CHECK (trigger IN ('tick', 'nightly', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text CHECK (char_length(error) <= 1000)
);
CREATE INDEX job_runs_job_idx ON job_runs (job, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON job_runs TO bayana_app;
