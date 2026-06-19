ALTER TABLE payments ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_amount_cents integer;

UPDATE payments SET original_amount_cents = amount_cents WHERE original_amount_cents IS NULL;

CREATE INDEX IF NOT EXISTS payments_gym_member_due_idx ON payments (gym_id, member_id, due_date DESC);
