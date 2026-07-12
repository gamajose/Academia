CREATE TABLE IF NOT EXISTS payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (gym_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS payment_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  original_total_cents integer NOT NULL CHECK (original_total_cents >= 0),
  negotiated_total_cents integer NOT NULL CHECK (negotiated_total_cents >= 0),
  installment_count integer NOT NULL CHECK (installment_count > 0),
  first_due_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_agreements_status_check CHECK (status IN ('active','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  opened_by uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_balance_cents integer NOT NULL DEFAULT 0 CHECK (opening_balance_cents >= 0),
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closing_balance_cents integer CHECK (closing_balance_cents >= 0),
  expected_balance_cents integer CHECK (expected_balance_cents >= 0),
  notes text,
  status text NOT NULL DEFAULT 'open',
  CONSTRAINT cash_sessions_status_check CHECK (status IN ('open','closed'))
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  description text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_movements_type_check CHECK (movement_type IN ('income','expense','withdrawal','deposit'))
);

CREATE TABLE IF NOT EXISTS public_sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  objective text,
  preferred_contact text,
  status text NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'website',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_sales_leads_status_check CHECK (status IN ('new','contacted','converted','lost'))
);

CREATE INDEX IF NOT EXISTS payment_receipts_member_idx ON payment_receipts (member_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS payment_agreements_member_idx ON payment_agreements (member_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_sessions_gym_status_idx ON cash_sessions (gym_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON cash_movements (cash_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS public_sales_leads_gym_status_idx ON public_sales_leads (gym_id, status, created_at DESC);
