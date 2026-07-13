ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_member_accounts_first_login
  ON member_accounts (gym_id, must_change_password)
  WHERE must_change_password = true;
