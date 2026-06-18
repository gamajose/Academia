CREATE INDEX IF NOT EXISTS gyms_status_idx ON gyms (status);
CREATE INDEX IF NOT EXISTS members_created_idx ON members (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plans_created_idx ON plans (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments (gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memberships_created_idx ON memberships (gym_id, created_at DESC);
