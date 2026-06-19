CREATE TABLE IF NOT EXISTS member_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  email text NOT NULL,
  secret_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, member_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS member_accounts_email_idx ON member_accounts (lower(email));
CREATE INDEX IF NOT EXISTS member_accounts_gym_member_idx ON member_accounts (gym_id, member_id, is_active);
