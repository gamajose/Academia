CREATE TABLE IF NOT EXISTS exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name text NOT NULL,
  muscle_group text NOT NULL,
  equipment text,
  level text NOT NULL DEFAULT 'frango',
  instructions text,
  video_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_gym_name_idx ON exercise_library (gym_id, lower(name));
CREATE INDEX IF NOT EXISTS exercise_library_gym_group_idx ON exercise_library (gym_id, muscle_group, level);

CREATE TABLE IF NOT EXISTS member_training_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'frango',
  goal text,
  restrictions text,
  training_days_per_week integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, member_id)
);

CREATE TABLE IF NOT EXISTS workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name text NOT NULL,
  level text NOT NULL DEFAULT 'frango',
  goal text,
  status text NOT NULL DEFAULT 'active',
  starts_at date NOT NULL DEFAULT current_date,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_plans_member_idx ON workout_plans (gym_id, member_id, status, starts_at);

CREATE TABLE IF NOT EXISTS workout_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  weekday integer NOT NULL,
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_days_plan_idx ON workout_days (gym_id, plan_id, weekday);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  workout_day_id uuid NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercise_library(id),
  order_index integer NOT NULL DEFAULT 1,
  sets integer NOT NULL DEFAULT 3,
  reps text NOT NULL DEFAULT '10-12',
  rest_seconds integer NOT NULL DEFAULT 60,
  load_hint text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_exercises_day_idx ON workout_exercises (gym_id, workout_day_id, order_index);

CREATE TABLE IF NOT EXISTS workout_ai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  plan_age_days integer NOT NULL DEFAULT 0,
  recommendation text NOT NULL,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
