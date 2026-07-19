ALTER TABLE members
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE visitor_accounts
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(7,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(6,2),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

