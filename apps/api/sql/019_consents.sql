-- Phase 10 privacy (SPEC 4.9 PV-01, 12.6): consent recorded with a timestamp and the policy version, per user and per
-- booking. Additive only. Append-only like the other evidence tables.

CREATE TABLE consents (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id),
  kind text NOT NULL CHECK (kind IN ('account_terms', 'privacy_policy', 'booking_terms')),
  policy_version text NOT NULL CHECK (char_length(policy_version) BETWEEN 1 AND 40),
  source text NOT NULL CHECK (source IN ('signup_email', 'signup_google', 'booking_accept')),
  ip inet,
  user_agent text CHECK (char_length(user_agent) <= 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR booking_id IS NOT NULL)
);
CREATE INDEX consents_user_idx ON consents (user_id, created_at);
CREATE INDEX consents_booking_idx ON consents (booking_id);
CREATE TRIGGER consents_no_rewrite BEFORE UPDATE OR DELETE ON consents FOR EACH ROW EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER consents_no_truncate BEFORE TRUNCATE ON consents FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_rewrite();
GRANT SELECT, INSERT ON consents TO bayana_app;

-- A customer who erases their data keeps their bookings' money records, with personal fields removed (PV-02).
ALTER TABLE bookings ADD COLUMN client_erased_at timestamptz;

-- The ledger stays append-only for money: amounts, links and dates never change and rows are never deleted. The one
-- permitted update is erasure, which replaces the free-text reason (it can hold a name from an offline-payment note)
-- with a fixed marker (PV-02 "ledger rows kept with personal fields removed").
CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reason = '[personal details removed]'
     AND (to_jsonb(NEW) - 'reason') = (to_jsonb(OLD) - 'reason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger is append-only';
END;
$$;
