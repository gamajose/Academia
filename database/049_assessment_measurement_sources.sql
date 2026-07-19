ALTER TABLE member_assessments
  ADD COLUMN IF NOT EXISTS measurement_sources jsonb NOT NULL DEFAULT '{}'::jsonb;
