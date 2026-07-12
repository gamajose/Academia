ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_provider text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_checkout_url text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_qr_code text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_qr_code_base64 text;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;
ALTER TABLE public_enrollments ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS public_enrollments_provider_payment_idx
  ON public_enrollments (payment_provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS public_enrollments_payment_status_idx
  ON public_enrollments (payment_status, created_at DESC);
