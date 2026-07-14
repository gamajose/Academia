ALTER TABLE student_social_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR';
