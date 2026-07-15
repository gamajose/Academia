ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_preferences jsonb NOT NULL DEFAULT '{"language":"pt-BR","theme":"light","accent":"blue"}'::jsonb;

UPDATE users
SET profile_preferences = jsonb_build_object(
  'language', COALESCE(profile_preferences->>'language', 'pt-BR'),
  'theme', COALESCE(profile_preferences->>'theme', 'light'),
  'accent', COALESCE(profile_preferences->>'accent', 'blue')
)
WHERE profile_preferences IS NULL
   OR profile_preferences->>'language' IS NULL
   OR profile_preferences->>'theme' IS NULL
   OR profile_preferences->>'accent' IS NULL;
