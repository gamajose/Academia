-- 066_reset_and_clean_production_data.sql
-- Limpeza completa dos dados operacionais e de demonstracao, mantendo apenas configuracoes e o usuario admin@academia.com

-- 1. Truncar todas as tabelas operacionais e de dados de alunos com verificacao previa
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'checkins', 'audit_logs', 'login_events', 'password_reset_tokens',
    'member_password_reset_tokens', 'user_password_reset_tokens',
    'access_decisions', 'access_commands', 'access_qr_challenges',
    'student_access_tokens', 'member_notifications',
    'payment_receipts', 'payment_agreements', 'cash_movements',
    'cash_sessions', 'public_sales_leads', 'public_enrollments',
    'payments', 'workout_exercise_logs', 'workout_day_logs',
    'workout_exercises', 'workout_days', 'workout_plans',
    'workout_ai_reviews', 'member_training_profiles',
    'member_assessments', 'member_goals', 'member_progress_ai_reviews',
    'ai_recommendation_feedback', 'student_workout_day_logs',
    'student_workout_exercises', 'student_workout_days',
    'student_workout_plans', 'student_private_exercises',
    'student_training_event_exercises', 'student_training_events',
    'class_reservations', 'class_sessions', 'gym_classes',
    'student_social_comment_likes', 'student_social_comments',
    'student_social_post_likes', 'student_social_follows',
    'student_social_posts', 'student_social_profiles',
    'visitor_accounts', 'member_accounts', 'memberships', 'members'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(tbl) || ' CASCADE';
    END IF;
  END LOOP;
END $$;

-- 2. Garantir usuarios PostgreSQL pauloacad, pauloacade e jose com a senha Paulo1
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pauloacad') THEN
    CREATE ROLE pauloacad WITH LOGIN PASSWORD 'Paulo1' SUPERUSER CREATEDB;
  ELSE
    ALTER ROLE pauloacad WITH PASSWORD 'Paulo1' SUPERUSER CREATEDB;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'pauloacade') THEN
    CREATE ROLE pauloacade WITH LOGIN PASSWORD 'Paulo1' SUPERUSER CREATEDB;
  ELSE
    ALTER ROLE pauloacade WITH PASSWORD 'Paulo1' SUPERUSER CREATEDB;
  END IF;

  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jose') THEN
    ALTER ROLE jose WITH PASSWORD 'Paulo1' SUPERUSER CREATEDB;
  END IF;
END $$;

-- 3. Garantir permissoes no banco e no schema public
GRANT ALL PRIVILEGES ON DATABASE academia TO pauloacad;
GRANT ALL PRIVILEGES ON DATABASE academia TO pauloacade;
GRANT ALL ON SCHEMA public TO pauloacad;
GRANT ALL ON SCHEMA public TO pauloacade;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pauloacad;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pauloacade;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pauloacad;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pauloacade;

-- 4. Remover usuarios do sistema que nao sejam o admin oficial
DELETE FROM users WHERE lower(email) <> 'admin@academia.com';

-- 5. Garantir que a academia exista e esteja ativa
INSERT INTO gyms (name, slug, status)
VALUES ('Academia Lobo', 'academia', 'active')
ON CONFLICT (slug) DO UPDATE
SET status = 'active', updated_at = now();

-- 6. Garantir que os perfis de acesso padrao existam para a academia ativa
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
WHERE g.status = 'active'
ON CONFLICT (gym_id, lower(slug)) DO NOTHING;

-- 7. Garantir planos padrao
INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Essencial', 8990, 30, 'Para quem quer começar com uma rotina simples e consistente.', '<ul><li>Musculação</li><li>Treino organizado</li><li>Acompanhamento da equipe</li></ul>', '<p>Acesso durante o horário de funcionamento da academia.</p>', true
FROM gyms g
WHERE g.status = 'active'
AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id = g.id AND lower(p.name) = lower('Essencial'));

INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Performance', 12990, 30, 'Mais acompanhamento para acelerar sua evolução.', '<ul><li>Musculação</li><li>Avaliação periódica</li><li>Revisão de treino</li></ul>', '<p>Plano mensal com acesso às áreas previstas pela academia.</p>', true
FROM gyms g
WHERE g.status = 'active'
AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id = g.id AND lower(p.name) = lower('Performance'));

INSERT INTO plans (gym_id, name, price_cents, duration_days, description, benefits, rules, is_active)
SELECT g.id, 'Premium', 17990, 30, 'Experiência completa para quem busca acompanhamento contínuo.', '<ul><li>Todos os benefícios</li><li>Aulas incluídas</li><li>Atendimento prioritário</li></ul>', '<p>Consulte a equipe para confirmar as modalidades incluídas.</p>', true
FROM gyms g
WHERE g.status = 'active'
AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.gym_id = g.id AND lower(p.name) = lower('Premium'));

-- 8. Garantir que admin@academia.com seja o unico usuario com senha Paulo1
DO $$
DECLARE
  v_gym_id uuid;
BEGIN
  SELECT id INTO v_gym_id FROM gyms WHERE status = 'active' ORDER BY created_at LIMIT 1;
  IF v_gym_id IS NOT NULL THEN
    INSERT INTO users (gym_id, name, email, password_hash, role, access_profile, is_active)
    VALUES (
      v_gym_id,
      'Administrador',
      'admin@academia.com',
      'pbkdf2$210000$c6947d7e6dca9ec30adb2d5aaff852fc$a6642a093c927229aa543c6df9cb00c3a3a9c7cdf8786db4fe388f98198d8fe2d1b6efb2b7ded2d366356355354f44246589227dfef1817a3f7daaa0e32bdb90',
      'admin',
      'admin',
      true
    )
    ON CONFLICT (lower(email)) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        role = 'admin',
        access_profile = 'admin',
        is_active = true,
        gym_id = v_gym_id;
  END IF;
END $$;
