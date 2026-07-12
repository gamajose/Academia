ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS confirmation_token_hash text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS email_confirmation_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS public_enrollments_confirmation_token_idx
  ON public_enrollments (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS member_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_account_id uuid NOT NULL REFERENCES member_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_password_reset_account_idx
  ON member_password_reset_tokens (member_account_id, expires_at DESC);
