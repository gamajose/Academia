ALTER TABLE student_access_tokens
  ADD COLUMN IF NOT EXISTS code_hash text;

CREATE INDEX IF NOT EXISTS student_access_tokens_code_lookup_idx
  ON student_access_tokens (gym_id, code_hash, expires_at)
  WHERE used_at IS NULL AND code_hash IS NOT NULL;
