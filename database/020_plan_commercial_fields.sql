ALTER TABLE plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS benefits text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS rules text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS public_highlight text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
