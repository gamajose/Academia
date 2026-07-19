CREATE INDEX IF NOT EXISTS student_social_posts_gallery_idx
  ON student_social_posts (gym_id, created_at DESC)
  WHERE is_active = true AND media_type = 'image' AND media_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_social_comments_gallery_idx
  ON student_social_comments (gym_id, created_at DESC)
  WHERE photo_url IS NOT NULL;
