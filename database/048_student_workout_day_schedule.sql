ALTER TABLE student_workout_days
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS end_time time DEFAULT '19:00';

UPDATE student_workout_days
SET start_time = COALESCE(start_time, '18:00'),
    end_time = CASE
      WHEN end_time IS NULL OR end_time <= start_time THEN '19:00'
      ELSE end_time
    END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_workout_days_schedule_check'
  ) THEN
    ALTER TABLE student_workout_days
      ADD CONSTRAINT student_workout_days_schedule_check
      CHECK (end_time IS NULL OR end_time > start_time);
  END IF;
END $$;
