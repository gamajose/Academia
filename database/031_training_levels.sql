CREATE TABLE IF NOT EXISTS training_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS training_levels_gym_slug_idx
  ON training_levels (gym_id, lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS training_levels_gym_name_idx
  ON training_levels (gym_id, lower(name));
CREATE INDEX IF NOT EXISTS training_levels_gym_active_idx
  ON training_levels (gym_id, is_active, sort_order, name);

INSERT INTO training_levels (gym_id, slug, name, sort_order)
SELECT g.id, defaults.slug, defaults.name, defaults.sort_order
FROM gyms g
CROSS JOIN (VALUES
  ('frango', 'Frango', 10),
  ('intermediario', 'Intermediario', 20),
  ('avancado', 'Avancado', 30)
) AS defaults(slug, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM training_levels tl
  WHERE tl.gym_id = g.id AND lower(tl.slug) = lower(defaults.slug)
);
