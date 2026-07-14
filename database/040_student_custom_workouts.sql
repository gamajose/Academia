CREATE TABLE IF NOT EXISTS student_workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Minha ficha',
  goal text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, member_id)
);

CREATE INDEX IF NOT EXISTS student_workout_plans_member_idx
  ON student_workout_plans (gym_id, member_id, status);

CREATE TABLE IF NOT EXISTS student_workout_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES student_workout_plans(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, weekday)
);

CREATE INDEX IF NOT EXISTS student_workout_days_plan_idx
  ON student_workout_days (gym_id, plan_id, weekday);

CREATE TABLE IF NOT EXISTS student_private_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name text NOT NULL,
  muscle_group text,
  equipment text,
  instructions text,
  video_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS student_private_exercises_name_idx
  ON student_private_exercises (gym_id, member_id, lower(name));

CREATE TABLE IF NOT EXISTS student_workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_day_id uuid NOT NULL REFERENCES student_workout_days(id) ON DELETE CASCADE,
  exercise_library_id uuid REFERENCES exercise_library(id) ON DELETE RESTRICT,
  private_exercise_id uuid REFERENCES student_private_exercises(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 1,
  sets integer NOT NULL DEFAULT 3 CHECK (sets BETWEEN 1 AND 30),
  reps text NOT NULL DEFAULT '10-12',
  rest_seconds integer NOT NULL DEFAULT 60 CHECK (rest_seconds BETWEEN 0 AND 3600),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((exercise_library_id IS NOT NULL AND private_exercise_id IS NULL)
      OR (exercise_library_id IS NULL AND private_exercise_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS student_workout_exercises_day_idx
  ON student_workout_exercises (gym_id, plan_day_id, order_index);

CREATE TABLE IF NOT EXISTS student_workout_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES student_workout_plans(id) ON DELETE CASCADE,
  plan_day_id uuid NOT NULL REFERENCES student_workout_days(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  feedback text,
  perceived_effort integer CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_workout_day_logs_member_idx
  ON student_workout_day_logs (gym_id, member_id, completed_at DESC);
