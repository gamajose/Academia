-- 064_student_enrollment_and_due_day.sql
-- Adiciona data de matrícula e dia de vencimento em members e memberships
-- e alinha as faturas dos alunos existentes para matrícula 13/05 e vencimento todo dia 13

ALTER TABLE members ADD COLUMN IF NOT EXISTS due_day integer DEFAULT 13 CHECK (due_day >= 1 AND due_day <= 31);
ALTER TABLE members ADD COLUMN IF NOT EXISTS enrollment_date date DEFAULT '2026-05-13';

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS due_day integer DEFAULT 13 CHECK (due_day >= 1 AND due_day <= 31);

-- Atualiza alunos existentes para cadastro/matrícula em 13/05/2026 e vencimento todo dia 13
UPDATE members
SET due_day = 13,
    enrollment_date = '2026-05-13',
    created_at = '2026-05-13 10:00:00Z'
WHERE due_day IS NULL OR enrollment_date IS NULL OR enrollment_date <> '2026-05-13';

UPDATE memberships
SET starts_at = '2026-05-13',
    due_day = 13
WHERE due_day IS NULL OR starts_at <> '2026-05-13';

-- Alinha mensalidades dos alunos existentes:
-- 13/05/2026: Pago (matrícula)
-- 13/06/2026: Pago
-- 13/07/2026: Pago
-- 13/08/2026: Pendente (em atraso)
-- 13/09/2026: Pendente (em atraso)
-- 13/10/2026: Pendente (em atraso)
-- 13/11/2026: Pendente (a vencer / próximo vencimento)

DO $$
DECLARE
  rec RECORD;
  m_plan RECORD;
  plan_price integer;
  plan_title text;
BEGIN
  FOR rec IN
    SELECT m.id AS member_id, m.gym_id, ms.id AS membership_id, ms.plan_id
    FROM members m
    INNER JOIN memberships ms ON ms.member_id = m.id AND ms.gym_id = m.gym_id AND ms.status = 'active'
  LOOP
    SELECT name, price_cents INTO m_plan FROM plans WHERE id = rec.plan_id;
    plan_price := COALESCE(m_plan.price_cents, 11990);
    plan_title := COALESCE(m_plan.name, 'Plano Mensal');

    -- Maio (13/05/2026) - Pago
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-05-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'paid', '2026-05-13', '2026-05-13 10:00:00Z', 'demo', 'Mensalidade ' || plan_title || ' - Matrícula');
    ELSE
      UPDATE payments SET status = 'paid', paid_at = COALESCE(paid_at, '2026-05-13 10:00:00Z')
      WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-05-13';
    END IF;

    -- Junho (13/06/2026) - Pago
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-06-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'paid', '2026-06-13', '2026-06-13 10:00:00Z', 'demo', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    ELSE
      UPDATE payments SET status = 'paid', paid_at = COALESCE(paid_at, '2026-06-13 10:00:00Z')
      WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-06-13';
    END IF;

    -- Julho (13/07/2026) - Pago
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-07-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'paid', '2026-07-13', '2026-07-13 10:00:00Z', 'demo', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    ELSE
      UPDATE payments SET status = 'paid', paid_at = COALESCE(paid_at, '2026-07-13 10:00:00Z')
      WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-07-13';
    END IF;

    -- Agosto (13/08/2026) - Pendente (em atraso)
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-08-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'pending', '2026-08-13', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    END IF;

    -- Setembro (13/09/2026) - Pendente (em atraso)
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-09-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'pending', '2026-09-13', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    END IF;

    -- Outubro (13/10/2026) - Pendente (em atraso)
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-10-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'pending', '2026-10-13', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    END IF;

    -- Novembro (13/11/2026) - Pendente (a vencer / próximo vencimento)
    IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND due_date = '2026-11-13') THEN
      INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
      VALUES (rec.gym_id, rec.member_id, rec.membership_id, plan_price, plan_price, 'pending', '2026-11-13', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
    END IF;

  END LOOP;
END $$;
