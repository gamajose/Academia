CREATE TABLE IF NOT EXISTS workout_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  workout_day_id uuid NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  feedback text,
  perceived_effort integer,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS workout_day_logs_member_idx ON workout_day_logs (gym_id, member_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS workout_day_logs_plan_idx ON workout_day_logs (gym_id, plan_id, workout_day_id);

CREATE TABLE IF NOT EXISTS workout_exercise_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  workout_day_log_id uuid NOT NULL REFERENCES workout_day_logs(id) ON DELETE CASCADE,
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  completed_sets integer,
  completed_reps text,
  load_used text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workout_exercise_logs_day_log_idx ON workout_exercise_logs (gym_id, workout_day_log_id);
