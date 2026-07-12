ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_profile text NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_details jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE users SET access_profile = CASE
  WHEN role IN ('owner', 'admin') THEN 'admin'
  WHEN role = 'operator' THEN 'operator'
  ELSE 'reception'
END
WHERE access_profile = 'admin';

CREATE INDEX IF NOT EXISTS users_gym_phone_idx ON users (gym_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS users_gym_cpf_idx
  ON users (gym_id, cpf) WHERE cpf IS NOT NULL AND cpf <> '';

CREATE TABLE IF NOT EXISTS user_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_password_reset_user_idx
  ON user_password_reset_tokens (user_id, expires_at DESC);
