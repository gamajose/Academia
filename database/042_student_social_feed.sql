CREATE TABLE IF NOT EXISTS student_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  bio text,
  website_url text,
  profile_photo_url text,
  is_private boolean NOT NULL DEFAULT false,
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  distance_unit text NOT NULL DEFAULT 'km' CHECK (distance_unit IN ('km', 'mi')),
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gym_id, member_id)
);

CREATE INDEX IF NOT EXISTS student_social_profiles_gym_visibility_idx
  ON student_social_profiles (gym_id, is_private, updated_at DESC);

CREATE TABLE IF NOT EXISTS student_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  caption text,
  media_url text,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'link')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (caption IS NOT NULL OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS student_social_posts_feed_idx
  ON student_social_posts (gym_id, created_at DESC)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS student_social_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  follower_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  following_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (follower_member_id <> following_member_id),
  UNIQUE (gym_id, follower_member_id, following_member_id)
);

CREATE INDEX IF NOT EXISTS student_social_follows_following_idx
  ON student_social_follows (gym_id, following_member_id, status);

CREATE INDEX IF NOT EXISTS student_social_follows_follower_idx
  ON student_social_follows (gym_id, follower_member_id, status);

CREATE TABLE IF NOT EXISTS student_social_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES student_social_posts(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, member_id)
);

CREATE INDEX IF NOT EXISTS student_social_post_likes_post_idx
  ON student_social_post_likes (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS student_social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES student_social_posts(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 800),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_social_comments_post_idx
  ON student_social_comments (post_id, created_at ASC);
