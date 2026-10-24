ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

CREATE TABLE otp_challenges (
  id uuid PRIMARY KEY, email citext NOT NULL, purpose text NOT NULL CHECK (purpose IN ('signup','login','reset','booking_verify')),
  code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), request_ip inet
);
CREATE INDEX otp_challenges_active_idx ON otp_challenges(email,purpose,created_at DESC) WHERE consumed_at IS NULL;
CREATE INDEX otp_challenges_ip_idx ON otp_challenges(request_ip,created_at DESC);

CREATE TABLE auth_tickets (
  id uuid PRIMARY KEY, token_hash text UNIQUE NOT NULL, email citext NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup','reset')), expires_at timestamptz NOT NULL,
  consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tickets_active_idx ON auth_tickets(token_hash,expires_at) WHERE consumed_at IS NULL;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS fresh_until timestamptz;

CREATE TABLE auth_events (
  id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE SET NULL, type text NOT NULL,
  ip inet, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_user_idx ON auth_events(user_id,created_at DESC);
