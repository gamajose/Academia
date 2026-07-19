ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb;

