CREATE TABLE IF NOT EXISTS gym_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  instructor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  room text,
  capacity integer NOT NULL DEFAULT 20 CHECK (capacity > 0),
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  level text,
  required_plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES gym_classes(id) ON DELETE CASCADE,
  instructor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_sessions_time_check CHECK (ends_at > starts_at),
  CONSTRAINT class_sessions_status_check CHECK (status IN ('scheduled','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS class_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'confirmed',
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_reservations_status_check CHECK (status IN ('confirmed','waitlist','cancelled','attended','absent')),
  UNIQUE (session_id, member_id)
);

CREATE TABLE IF NOT EXISTS access_qr_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES access_devices(id) ON DELETE CASCADE,
  challenge_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  access_decision_id uuid REFERENCES access_decisions(id) ON DELETE SET NULL,
  result_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_qr_challenges_result_check CHECK (result_status IS NULL OR result_status IN ('allowed','denied'))
);

ALTER TABLE plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS enrollment_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS access_rules jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS services_included jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS cancellation_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS class_sessions_gym_start_idx ON class_sessions (gym_id, starts_at, status);
CREATE INDEX IF NOT EXISTS class_reservations_member_idx ON class_reservations (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS class_reservations_session_status_idx ON class_reservations (session_id, status);
CREATE INDEX IF NOT EXISTS access_qr_challenges_device_idx ON access_qr_challenges (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS access_qr_challenges_expiry_idx ON access_qr_challenges (expires_at) WHERE used_at IS NULL;
