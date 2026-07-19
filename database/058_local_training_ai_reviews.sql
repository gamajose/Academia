ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'rules_fallback';
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'maintain';
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS confidence numeric(4,3) NOT NULL DEFAULT 0;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS requires_human_review boolean NOT NULL DEFAULT true;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS signals jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS student_message text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS trainer_notes text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS input_snapshot_hash text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS token_usage jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_ai_reviews_source_check') THEN
    ALTER TABLE workout_ai_reviews ADD CONSTRAINT workout_ai_reviews_source_check
      CHECK (source IN ('local_generative', 'rules_fallback')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_ai_reviews_status_check') THEN
    ALTER TABLE workout_ai_reviews ADD CONSTRAINT workout_ai_reviews_status_check
      CHECK (status IN ('maintain', 'adjust', 'replace_partially', 'professional_review')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_ai_reviews_confidence_check') THEN
    ALTER TABLE workout_ai_reviews ADD CONSTRAINT workout_ai_reviews_confidence_check
      CHECK (confidence >= 0 AND confidence <= 1) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_ai_reviews_decision_check') THEN
    ALTER TABLE workout_ai_reviews ADD CONSTRAINT workout_ai_reviews_decision_check
      CHECK (NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS workout_ai_reviews_plan_history_idx
  ON workout_ai_reviews (gym_id, plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workout_ai_reviews_student_approved_idx
  ON workout_ai_reviews (gym_id, member_id, approved_at DESC)
  WHERE approved_at IS NOT NULL AND rejected_at IS NULL;
CREATE INDEX IF NOT EXISTS workout_ai_reviews_rate_idx
  ON workout_ai_reviews (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workout_ai_reviews_input_hash_idx
  ON workout_ai_reviews (gym_id, plan_id, input_snapshot_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS training_ai_generation_locks (
  lock_key text PRIMARY KEY,
  lock_token uuid NOT NULL DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  plan_id uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS training_ai_generation_locks_expiry_idx
  ON training_ai_generation_locks (expires_at);
