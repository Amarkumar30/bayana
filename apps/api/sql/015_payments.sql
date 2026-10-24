-- Phase 7 payments (SPEC 11, PY-01..PY-11). RENAMES two columns (payments.raw_event, webhook_events.provider_event_id):
-- back up before applying to a database with data.

-- 1. payments: one row per Razorpay order or offline receipt. Statuses are lower case from here on.
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
UPDATE payments SET status = lower(status);
ALTER TABLE payments RENAME COLUMN raw_event TO raw;
ALTER TABLE payments
  ADD COLUMN provider text NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'offline')),
  ADD COLUMN currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  ADD COLUMN kind text NOT NULL DEFAULT 'advance' CHECK (kind IN ('advance', 'balance')),
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN method text CHECK (method IN ('card', 'upi', 'netbanking', 'wallet', 'cash', 'bank_transfer', 'other')),
  ADD COLUMN note text CHECK (char_length(note) <= 500),
  ADD COLUMN recorded_by uuid REFERENCES users(id),
  ADD COLUMN failure_reason text CHECK (char_length(failure_reason) <= 500),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payments ALTER COLUMN provider_order_id DROP NOT NULL;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'));
ALTER TABLE payments ADD CONSTRAINT payments_razorpay_has_order CHECK (provider <> 'razorpay' OR provider_order_id IS NOT NULL);
ALTER TABLE payments ADD CONSTRAINT payments_offline_has_note CHECK (provider <> 'offline' OR (note IS NOT NULL AND char_length(trim(note)) > 0 AND recorded_by IS NOT NULL));
UPDATE payments SET verified_at = created_at WHERE status IN ('captured', 'refunded');
-- At most one open online order per booking and kind, so a repeated "pay" click reuses it (PY-02 idempotency).
CREATE UNIQUE INDEX payments_one_open_order ON payments (booking_id, kind) WHERE provider = 'razorpay' AND status IN ('created', 'failed', 'authorized');
CREATE INDEX payments_booking_idx ON payments (booking_id, created_at);
COMMENT ON COLUMN payments.provider_refund_id IS 'Unused since 015; refunds live in the refunds table.';

-- 2. refunds: every refund, online or owed in cash, linked to its payment and booking (PY-08).
CREATE TABLE refunds (
  id uuid PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL CHECK (status IN ('pending', 'processed', 'failed', 'manual')),
  provider_refund_id text UNIQUE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  error text CHECK (char_length(error) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX refunds_payment_idx ON refunds (payment_id);

-- 3. webhook_events: deduplicated by Razorpay's x-razorpay-event-id; processed after the 2xx reply.
ALTER TABLE webhook_events RENAME COLUMN provider_event_id TO event_id;
ALTER TABLE webhook_events
  ADD COLUMN type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN processed_at timestamptz,
  ADD COLUMN error text CHECK (char_length(error) <= 1000),
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
UPDATE webhook_events SET type = COALESCE(payload->>'event', 'unknown'), processed_at = received_at;
CREATE INDEX webhook_events_unprocessed_idx ON webhook_events (received_at) WHERE processed_at IS NULL;

-- 4. The ledger says where money moved: Razorpay, offline (cash, UPI to the vendor), or system entries.
ALTER TABLE ledger_entries ADD COLUMN channel text NOT NULL DEFAULT 'system' CHECK (channel IN ('razorpay', 'offline', 'system'));
ALTER TABLE ledger_entries ADD COLUMN refund_id uuid REFERENCES refunds(id);

-- 5. Audit rows (offline payments, manual confirmations, payment reviews) are append-only like booking_events.
CREATE TRIGGER audit_logs_no_rewrite BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_rewrite();
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id, created_at);

-- 6. GST fields on receipts appear only when the vendor provides a GSTIN (PY-11).
ALTER TABLE vendors ADD COLUMN gstin text CHECK (gstin ~ '^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$');

GRANT SELECT, INSERT, UPDATE ON refunds TO bayana_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM bayana_app;
