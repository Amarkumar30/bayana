-- Phase 6: click-wrap contract evidence (SPEC 11.5, CT-02, CT-03). Additive only.
-- One frozen contract per booking: the exact text the customer agreed to, its SHA-256, and who agreed, when and from where.
CREATE TABLE booking_contracts (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 60000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_email citext NOT NULL,
  ip text NOT NULL DEFAULT '' CHECK (char_length(ip) <= 100),
  user_agent text NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 1000)
);

-- Evidence is never rewritten, by any role (same approach as booking_events in 013).
CREATE FUNCTION reject_evidence_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER booking_contracts_no_rewrite BEFORE UPDATE OR DELETE ON booking_contracts FOR EACH ROW EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER booking_contracts_no_truncate BEFORE TRUNCATE ON booking_contracts FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_rewrite();
GRANT SELECT, INSERT ON booking_contracts TO bayana_app;
REVOKE UPDATE, DELETE, TRUNCATE ON booking_contracts FROM bayana_app;
