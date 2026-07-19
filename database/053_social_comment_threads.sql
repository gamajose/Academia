ALTER TABLE student_social_comments
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE student_social_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES student_social_comments(id) ON DELETE CASCADE;

ALTER TABLE student_social_comments
  ADD COLUMN IF NOT EXISTS reply_to_comment_id uuid REFERENCES student_social_comments(id) ON DELETE SET NULL;

ALTER TABLE student_social_comments
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE student_social_comments
  DROP CONSTRAINT IF EXISTS student_social_comments_body_check;

ALTER TABLE student_social_comments
  DROP CONSTRAINT IF EXISTS student_social_comments_content_check;

ALTER TABLE student_social_comments
  ADD CONSTRAINT student_social_comments_content_check
  CHECK (
    (body IS NULL OR length(body) BETWEEN 1 AND 800)
    AND (NULLIF(body, '') IS NOT NULL OR NULLIF(photo_url, '') IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS student_social_comments_parent_idx
  ON student_social_comments (parent_comment_id, created_at ASC)
  WHERE parent_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS student_social_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES student_social_comments(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_social_comment_likes_author_check
    CHECK ((member_id IS NOT NULL AND user_id IS NULL) OR (member_id IS NULL AND user_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS student_social_comment_likes_member_unique
  ON student_social_comment_likes (comment_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS student_social_comment_likes_user_unique
  ON student_social_comment_likes (comment_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_social_comment_likes_comment_idx
  ON student_social_comment_likes (comment_id, created_at DESC);
