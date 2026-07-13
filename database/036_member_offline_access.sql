ALTER TABLE members
  ADD COLUMN IF NOT EXISTS access_number text,
  ADD COLUMN IF NOT EXISTS offline_pin_seed text;

CREATE UNIQUE INDEX IF NOT EXISTS members_gym_access_number_uidx
  ON members (gym_id, access_number)
  WHERE access_number IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_access_number_format_chk'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_access_number_format_chk
      CHECK (access_number IS NULL OR access_number ~ '^[0-9]{6}$');
  END IF;
END
$$;
