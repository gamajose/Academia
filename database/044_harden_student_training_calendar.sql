-- Repara instalações que chegaram a registrar a agenda antes de concluir sua estrutura.
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE student_training_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS student_training_event_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES student_training_events(id) ON DELETE CASCADE,
  exercise_library_id uuid REFERENCES exercise_library(id) ON DELETE RESTRICT,
  private_exercise_id uuid REFERENCES student_private_exercises(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 1,
  sets integer NOT NULL DEFAULT 3,
  reps text NOT NULL DEFAULT '10-12',
  rest_seconds integer NOT NULL DEFAULT 60,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS gym_id uuid;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS exercise_library_id uuid;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS private_exercise_id uuid;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 1;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS sets integer NOT NULL DEFAULT 3;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS reps text NOT NULL DEFAULT '10-12';
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS rest_seconds integer NOT NULL DEFAULT 60;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE student_training_event_exercises ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS student_training_events_member_date_idx
  ON student_training_events (gym_id, member_id, scheduled_date, start_time);
CREATE INDEX IF NOT EXISTS student_training_event_exercises_idx
  ON student_training_event_exercises (gym_id, event_id, order_index);
