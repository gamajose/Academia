ALTER TABLE gyms ADD COLUMN IF NOT EXISTS payment_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
