-- Phase 3 auth: expand-only. New tables replace auth_sessions, otp_challenges, auth_tickets and auth_otps,
-- which are left in place (unused) for a later contract migration after a backup.

-- users.email is citext UNIQUE already; the explicit normalized column matches SPEC 8.2 and is what auth code queries.
ALTER TABLE users ADD COLUMN email_normalized text GENERATED ALWAYS AS (lower(email::text)) STORED;
CREATE UNIQUE INDEX users_email_normalized_key ON users(email_normalized);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip inet,
  user_agent text CHECK (char_length(user_agent) <= 512),
  CHECK (expires_at <= absolute_expires_at)
);
CREATE INDEX sessions_user_active_idx ON sessions(user_id, created_at DESC) WHERE revoked_at IS NULL;

-- Keep everyone who is signed in today signed in: the token hash scheme is unchanged.
INSERT INTO sessions(id, user_id, token_hash, created_at, last_used_at, expires_at, absolute_expires_at)
SELECT id, user_id, token_hash, created_at, last_used_at, LEAST(expires_at, created_at + interval '90 days'), created_at + interval '90 days'
FROM auth_sessions
WHERE expires_at > now() AND created_at + interval '90 days' > now();

CREATE TABLE otp_codes (
  id uuid PRIMARY KEY,
  email_normalized text NOT NULL CHECK (email_normalized = lower(email_normalized)),
  purpose text NOT NULL CHECK (purpose IN ('signup', 'login', 'reset', 'booking_verify')),
  code_hmac text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  request_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_active_idx ON otp_codes(email_normalized, purpose, created_at DESC) WHERE consumed_at IS NULL;
CREATE INDEX otp_codes_email_recent_idx ON otp_codes(email_normalized, created_at DESC);
CREATE INDEX otp_codes_ip_recent_idx ON otp_codes(request_ip, created_at DESC);
