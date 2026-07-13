ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS muscle_group_primary text;

ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS muscle_group_secondary text;

UPDATE exercise_library
SET muscle_group_primary = muscle_group
WHERE muscle_group_primary IS NULL OR btrim(muscle_group_primary) = '';

CREATE INDEX IF NOT EXISTS exercise_library_gym_primary_muscle_idx
  ON exercise_library (gym_id, muscle_group_primary);
