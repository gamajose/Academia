CREATE TABLE IF NOT EXISTS student_training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title text NOT NULL,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE INDEX IF NOT EXISTS student_training_events_member_date_idx
  ON student_training_events (gym_id, member_id, scheduled_date, start_time);

CREATE TABLE IF NOT EXISTS student_training_event_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES student_training_events(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS student_training_event_exercises_idx
  ON student_training_event_exercises (gym_id, event_id, order_index);
