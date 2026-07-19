ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'legacy';
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS confidence numeric(5,2);
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS performance_score numeric(5,2);
ALTER TABLE workout_ai_reviews ADD COLUMN IF NOT EXISTS analysis_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ai_recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES workout_ai_reviews(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES workout_plans(id) ON DELETE SET NULL,
  recommendation_key text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected', 'applied')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_recommendation_feedback_learning_idx ON ai_recommendation_feedback (gym_id, decision, recommendation_key, created_at DESC);
CREATE INDEX IF NOT EXISTS workout_ai_reviews_member_model_idx ON workout_ai_reviews (gym_id, member_id, model_version, created_at DESC);
