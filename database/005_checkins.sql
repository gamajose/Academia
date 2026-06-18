CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS checkins_gym_checked_at_idx ON checkins (gym_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS checkins_member_checked_at_idx ON checkins (member_id, checked_at DESC);
