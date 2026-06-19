CREATE TABLE IF NOT EXISTS member_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  assessment_date date NOT NULL DEFAULT current_date,
  weight_kg numeric(6,2),
  height_cm numeric(6,2),
  body_fat_percent numeric(5,2),
  muscle_mass_kg numeric(6,2),
  waist_cm numeric(6,2),
  chest_cm numeric(6,2),
  hip_cm numeric(6,2),
  left_arm_cm numeric(6,2),
  right_arm_cm numeric(6,2),
  left_thigh_cm numeric(6,2),
  right_thigh_cm numeric(6,2),
  resting_heart_rate integer,
  photo_url text,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_assessments_member_idx ON member_assessments (gym_id, member_id, assessment_date DESC);

CREATE TABLE IF NOT EXISTS member_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  goal_type text NOT NULL,
  target_value numeric(10,2),
  target_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_goals_member_idx ON member_goals (gym_id, member_id, status, target_date);
