ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS document text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS allergies text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS medical_notes text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS nutrition_notes text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'pending_payment',
  payment_method text,
  enrollment_code text UNIQUE,
  qr_payload text,
  created_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS public_enrollments_gym_status_idx ON public_enrollments (gym_id, status, created_at DESC);
