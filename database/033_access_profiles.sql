CREATE TABLE IF NOT EXISTS access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  role_key text NOT NULL DEFAULT 'staff',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_profiles_role_key_check CHECK (role_key IN ('owner', 'admin', 'staff', 'operator'))
);

CREATE UNIQUE INDEX IF NOT EXISTS access_profiles_gym_slug_idx
  ON access_profiles (gym_id, lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS access_profiles_gym_name_idx
  ON access_profiles (gym_id, lower(name));
CREATE INDEX IF NOT EXISTS access_profiles_gym_active_idx
  ON access_profiles (gym_id, is_active, sort_order, name);

INSERT INTO access_profiles (gym_id, slug, name, role_key, permissions, sort_order)
SELECT g.id, seed.slug, seed.name, seed.role_key, seed.permissions::jsonb, seed.sort_order
FROM gyms g
CROSS JOIN (VALUES
  ('owner', 'Proprietário', 'owner', '{"dashboard":true,"members":true,"plans":true,"memberships":true,"pre_enrollments":true,"finance":true,"alerts":true,"training":true,"assessments":true,"student_access":true,"users":true,"account":true,"reports":true,"access":true,"classes":true,"settings":true,"audit":true,"exports":true}', 10),
  ('admin', 'Administrador', 'admin', '{"dashboard":true,"members":true,"plans":true,"memberships":true,"pre_enrollments":true,"finance":true,"alerts":true,"training":true,"assessments":true,"student_access":true,"users":true,"account":true,"reports":true,"access":true,"classes":true,"settings":true,"audit":true,"exports":true}', 20),
  ('reception', 'Recepção', 'staff', '{"dashboard":true,"members":true,"memberships":true,"pre_enrollments":true,"alerts":true,"student_access":true,"account":true}', 30),
  ('trainer', 'Personal trainer', 'staff', '{"dashboard":true,"members":true,"training":true,"assessments":true,"student_access":true,"account":true}', 40),
  ('operator', 'Operação', 'operator', '{"dashboard":true,"access":true,"student_access":true,"account":true}', 50)
) AS seed(slug, name, role_key, permissions, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM access_profiles p
  WHERE p.gym_id = g.id AND lower(p.slug) = lower(seed.slug)
);

UPDATE users u
SET access_profile = CASE
  WHEN u.role = 'owner' THEN 'owner'
  WHEN u.role = 'admin' THEN 'admin'
  WHEN u.role = 'operator' THEN 'operator'
  WHEN u.access_profile IN ('reception', 'trainer') THEN u.access_profile
  ELSE 'reception'
END
WHERE NOT EXISTS (
  SELECT 1 FROM access_profiles p
  WHERE p.gym_id = u.gym_id AND p.slug = u.access_profile
);
