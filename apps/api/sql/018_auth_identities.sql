-- Google sign-in and passwordless-first auth (SPEC 4.1 AU-01/AU-02, 12.1). Additive only.
-- users.password_hash is already nullable: a password is optional for vendors.

-- 1. External sign-in identities. Only the provider's stable subject is kept; no access, refresh or ID tokens.
CREATE TABLE auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),
  provider_subject text NOT NULL CHECK (char_length(provider_subject) BETWEEN 1 AND 255),
  email_at_link citext NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

-- 2. One row per Google sign-in attempt, keyed by the SHA-256 of its state. The callback claims it once (used_at), so a
--    replayed callback fails even if the browser cookie was copied.
CREATE TABLE oauth_login_states (
  state_hash text PRIMARY KEY CHECK (char_length(state_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX oauth_login_states_created_idx ON oauth_login_states (created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_identities, oauth_login_states TO bayana_app;
