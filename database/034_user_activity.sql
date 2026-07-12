ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS users_gym_last_seen_idx
  ON users (gym_id, last_seen_at DESC);
