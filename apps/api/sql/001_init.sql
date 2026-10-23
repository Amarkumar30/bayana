CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE photographers (
  id uuid PRIMARY KEY, slug citext UNIQUE NOT NULL, display_name text NOT NULL,
  city text NOT NULL, bio text NOT NULL DEFAULT '', base_price_paise bigint NOT NULL CHECK (base_price_paise > 0),
  advance_type text NOT NULL CHECK (advance_type IN ('PERCENT','FIXED')),
  advance_value integer NOT NULL CHECK (advance_value > 0), bookings_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE availability (
  photographer_id uuid NOT NULL REFERENCES photographers(id), event_date date NOT NULL,
  state text NOT NULL CHECK (state IN ('AVAILABLE','BLOCKED')), price_paise bigint CHECK (price_paise > 0),
  PRIMARY KEY (photographer_id, event_date)
);
CREATE TABLE bookings (
  id uuid PRIMARY KEY, photographer_id uuid NOT NULL REFERENCES photographers(id), event_date date NOT NULL,
  client_name text NOT NULL, client_email citext NOT NULL, client_phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('HELD','CONFIRMED','COMPLETED','CANCELLED','EXPIRED','EXPIRED_PAID')),
  total_paise bigint NOT NULL CHECK (total_paise > 0), advance_paise bigint NOT NULL CHECK (advance_paise > 0 AND advance_paise <= total_paise),
  hold_expires_at timestamptz, idempotency_key text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_booking_per_day ON bookings(photographer_id,event_date) WHERE status IN ('HELD','CONFIRMED','COMPLETED');
CREATE TABLE booking_events (id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), from_status text, to_status text NOT NULL, actor text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payments (id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), provider_order_id text UNIQUE NOT NULL, status text NOT NULL CHECK (status IN ('CREATED','CAPTURED','REFUNDED')), amount_paise bigint NOT NULL CHECK (amount_paise > 0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_entries (id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), payment_id uuid REFERENCES payments(id), kind text NOT NULL CHECK (kind IN ('CHARGE','PAYMENT','REFUND')), amount_paise bigint NOT NULL CHECK (amount_paise <> 0), actor text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE webhook_events (provider_event_id text PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ledger is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
