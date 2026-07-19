ALTER TABLE student_social_posts
  ADD COLUMN IF NOT EXISTS author_user_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE student_social_posts
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE student_social_posts
  DROP CONSTRAINT IF EXISTS student_social_posts_author_check;

ALTER TABLE student_social_posts
  ADD CONSTRAINT student_social_posts_author_check
  CHECK ((member_id IS NOT NULL AND author_user_id IS NULL) OR (member_id IS NULL AND author_user_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS student_social_posts_admin_author_idx
  ON student_social_posts (gym_id, author_user_id, created_at DESC)
  WHERE author_user_id IS NOT NULL;
