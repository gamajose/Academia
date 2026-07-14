ALTER TABLE student_private_exercises
  ADD COLUMN IF NOT EXISTS muscle_group_primary text,
  ADD COLUMN IF NOT EXISTS muscle_group_secondary text,
  ADD COLUMN IF NOT EXISTS image_url text;
