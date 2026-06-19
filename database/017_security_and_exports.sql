CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid REFERENCES gyms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  member_account_id uuid REFERENCES member_accounts(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'admin',
  email text,
  success boolean NOT NULL DEFAULT false,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_gym_created_idx ON login_events (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_events_email_created_idx ON login_events (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid REFERENCES gyms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  member_account_id uuid REFERENCES member_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  actor_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_lookup_idx ON password_reset_tokens (gym_id, actor_type, expires_at, used_at);
