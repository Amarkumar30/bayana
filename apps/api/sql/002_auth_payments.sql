CREATE TABLE users (
  id uuid PRIMARY KEY,
  email citext UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('PHOTOGRAPHER','CLIENT','ADMIN')),
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS owner_user_id uuid UNIQUE REFERENCES users(id);
CREATE TABLE auth_otps (
  id uuid PRIMARY KEY,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('PHOTOGRAPHER','CLIENT')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_otps_active_email_idx ON auth_otps(email, role, expires_at) WHERE consumed_at IS NULL;
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_active_idx ON auth_sessions(token_hash, expires_at);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id text UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_refund_id text UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_event jsonb;
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
