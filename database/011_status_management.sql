ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES memberships(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS payments_membership_idx ON payments (membership_id);
