ALTER TABLE exercise_library
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS exercise_library_gym_media_idx
  ON exercise_library (gym_id, is_active, image_url)
  WHERE image_url IS NOT NULL;
