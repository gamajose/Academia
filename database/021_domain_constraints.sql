DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gyms_status_check') THEN
    ALTER TABLE gyms ADD CONSTRAINT gyms_status_check CHECK (status IN ('active','inactive','suspended')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','staff','student','operator')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_status_check') THEN
    ALTER TABLE members ADD CONSTRAINT members_status_check CHECK (status IN ('active','inactive')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_duration_days_check') THEN
    ALTER TABLE plans ADD CONSTRAINT plans_duration_days_check CHECK (duration_days > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_status_check') THEN
    ALTER TABLE memberships ADD CONSTRAINT memberships_status_check CHECK (status IN ('active','pending','expired','cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memberships_date_order_check') THEN
    ALTER TABLE memberships ADD CONSTRAINT memberships_date_order_check CHECK (ends_at >= starts_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending','paid','overdue','cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_enrollments_status_check') THEN
    ALTER TABLE public_enrollments ADD CONSTRAINT public_enrollments_status_check CHECK (status IN ('pending_payment','pending','confirmed','cancelled')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS members_gym_email_idx ON members (gym_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_member_status_idx ON memberships (member_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS payments_member_status_idx ON payments (member_id, status, due_date DESC);
CREATE INDEX IF NOT EXISTS public_enrollments_code_idx ON public_enrollments (enrollment_code) WHERE enrollment_code IS NOT NULL;
