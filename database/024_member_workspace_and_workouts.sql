ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_name text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_phone text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS address_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS review_due_at date;
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS training_days_per_week integer;
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS general_notes text;
ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS suggested_load text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS cadence text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS training_method text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS progression_rule text;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS substitute_exercise_id uuid REFERENCES exercise_library(id) ON DELETE SET NULL;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE workout_exercise_logs ADD COLUMN IF NOT EXISTS perceived_effort integer;
ALTER TABLE workout_exercise_logs ADD COLUMN IF NOT EXISTS pain_level integer;
ALTER TABLE workout_exercise_logs ADD COLUMN IF NOT EXISTS completed_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_plans_training_days_check') THEN
    ALTER TABLE workout_plans ADD CONSTRAINT workout_plans_training_days_check
      CHECK (training_days_per_week IS NULL OR training_days_per_week BETWEEN 1 AND 7) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_exercise_logs_effort_check') THEN
    ALTER TABLE workout_exercise_logs ADD CONSTRAINT workout_exercise_logs_effort_check
      CHECK (perceived_effort IS NULL OR perceived_effort BETWEEN 1 AND 10) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_exercise_logs_pain_check') THEN
    ALTER TABLE workout_exercise_logs ADD CONSTRAINT workout_exercise_logs_pain_check
      CHECK (pain_level IS NULL OR pain_level BETWEEN 0 AND 10) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS members_assigned_staff_idx ON members (gym_id, assigned_staff_id, status);
CREATE INDEX IF NOT EXISTS workout_plans_review_due_idx ON workout_plans (gym_id, review_due_at, status);
CREATE INDEX IF NOT EXISTS workout_exercise_logs_exercise_history_idx
  ON workout_exercise_logs (gym_id, workout_exercise_id, completed_at DESC);
