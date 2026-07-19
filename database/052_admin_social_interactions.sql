ALTER TABLE student_social_post_likes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE student_social_post_likes
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE student_social_post_likes
  DROP CONSTRAINT IF EXISTS student_social_post_likes_author_check;

ALTER TABLE student_social_post_likes
  ADD CONSTRAINT student_social_post_likes_author_check
  CHECK ((member_id IS NOT NULL AND user_id IS NULL) OR (member_id IS NULL AND user_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS student_social_post_likes_user_unique
  ON student_social_post_likes (post_id, user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE student_social_comments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE student_social_comments
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE student_social_comments
  DROP CONSTRAINT IF EXISTS student_social_comments_author_check;

ALTER TABLE student_social_comments
  ADD CONSTRAINT student_social_comments_author_check
  CHECK ((member_id IS NOT NULL AND user_id IS NULL) OR (member_id IS NULL AND user_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS student_social_comments_user_idx
  ON student_social_comments (gym_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
