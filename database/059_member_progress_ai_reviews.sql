CREATE TABLE IF NOT EXISTS member_progress_ai_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  snapshot_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_progress_ai_reviews_payload_object_chk
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS member_progress_ai_reviews_snapshot_uidx
  ON member_progress_ai_reviews (gym_id, member_id, snapshot_hash);

CREATE INDEX IF NOT EXISTS member_progress_ai_reviews_member_created_idx
  ON member_progress_ai_reviews (gym_id, member_id, created_at DESC);
