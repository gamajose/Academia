CREATE TABLE IF NOT EXISTS access_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  api_key_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, code)
);

CREATE INDEX IF NOT EXISTS access_devices_gym_active_idx
  ON access_devices (gym_id, is_active, name);

CREATE TABLE IF NOT EXISTS student_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_account_id uuid REFERENCES member_accounts(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_access_tokens_lookup_idx
  ON student_access_tokens (token_hash, expires_at)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS student_access_tokens_member_idx
  ON student_access_tokens (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS access_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  device_id uuid REFERENCES access_devices(id) ON DELETE SET NULL,
  token_id uuid REFERENCES student_access_tokens(id) ON DELETE SET NULL,
  checkin_id uuid REFERENCES checkins(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'student_qr',
  allowed boolean NOT NULL,
  status text NOT NULL,
  reason text NOT NULL,
  overdue_days integer NOT NULL DEFAULT 0 CHECK (overdue_days >= 0),
  message text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS access_decisions_gym_decided_idx
  ON access_decisions (gym_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS access_decisions_member_decided_idx
  ON access_decisions (member_id, decided_at DESC);
