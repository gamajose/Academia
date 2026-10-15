-- 065_cleanup_and_align_student_invoices.sql
-- Higieniza pagamentos de alunos, remove duplicatas e garante o alinhamento das 7 faturas (13/05 a 13/11)

-- 1. Vincula membership_id aos pagamentos de alunos que estejam sem membership_id
UPDATE payments p
SET membership_id = sub.id
FROM (
  SELECT DISTINCT ON (member_id, gym_id) id, member_id, gym_id
  FROM memberships
  ORDER BY member_id, gym_id, CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC
) sub
WHERE p.member_id = sub.member_id AND p.gym_id = sub.gym_id AND p.membership_id IS NULL;

-- 2. Remove pagamentos pendentes duplicados no mesmo mês/ano de vencimento para o mesmo aluno
DELETE FROM payments p1
USING payments p2
WHERE p1.gym_id = p2.gym_id
  AND p1.member_id = p2.member_id
  AND p1.status = 'pending'
  AND p2.status = 'pending'
  AND p1.id <> p2.id
  AND to_char(p1.due_date, 'YYYY-MM') = to_char(p2.due_date, 'YYYY-MM')
  AND p1.created_at >= p2.created_at;

-- 3. Se houver um pagamento pago e um pendente no mesmo mês, remove o pendente
DELETE FROM payments p_pend
USING payments p_paid
WHERE p_pend.gym_id = p_paid.gym_id
  AND p_pend.member_id = p_paid.member_id
  AND p_pend.status = 'pending'
  AND p_paid.status = 'paid'
  AND to_char(p_pend.due_date, 'YYYY-MM') = to_char(p_paid.due_date, 'YYYY-MM');

-- 4. Alinha rigorosamente os 7 ciclos dos alunos para o dia 13
DO $$
DECLARE
  rec RECORD;
  m_plan RECORD;
  plan_price integer;
  plan_title text;
  v_mem_id uuid;
  v_plan_id uuid;
BEGIN
  FOR rec IN
    SELECT m.id AS member_id, m.gym_id
    FROM members m
  LOOP
    -- Busca a matrícula ativa ou mais recente do aluno
    SELECT ms.id, ms.plan_id INTO v_mem_id, v_plan_id
    FROM memberships ms
    WHERE ms.member_id = rec.member_id AND ms.gym_id = rec.gym_id
    ORDER BY CASE WHEN ms.status = 'active' THEN 0 ELSE 1 END, ms.created_at DESC
    LIMIT 1;

    IF v_mem_id IS NOT NULL THEN
      SELECT name, price_cents INTO m_plan FROM plans WHERE id = v_plan_id;
      plan_price := COALESCE(m_plan.price_cents, 11990);
      plan_title := COALESCE(m_plan.name, 'Plano Mensal');

      -- Atualiza due_day e enrollment_date
      UPDATE members SET due_day = 13, enrollment_date = '2026-05-13'::date WHERE id = rec.member_id;
      UPDATE memberships SET due_day = 13, starts_at = '2026-05-13'::date WHERE id = v_mem_id;

      -- 13/05/2026: Pago
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-05') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'paid', '2026-05-13'::date, '2026-05-13 10:00:00Z'::timestamptz, 'demo', 'Mensalidade ' || plan_title || ' - Matrícula');
      ELSE
        UPDATE payments SET due_date = '2026-05-13'::date, status = 'paid', paid_at = COALESCE(paid_at, '2026-05-13 10:00:00Z'::timestamptz), membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Matrícula'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-05';
      END IF;

      -- 13/06/2026: Pago
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-06') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'paid', '2026-06-13'::date, '2026-06-13 10:00:00Z'::timestamptz, 'demo', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-06-13'::date, status = 'paid', paid_at = COALESCE(paid_at, '2026-06-13 10:00:00Z'::timestamptz), membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-06';
      END IF;

      -- 13/07/2026: Pago
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-07') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, paid_at, method, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'paid', '2026-07-13'::date, '2026-07-13 10:00:00Z'::timestamptz, 'demo', 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-07-13'::date, status = 'paid', paid_at = COALESCE(paid_at, '2026-07-13 10:00:00Z'::timestamptz), membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-07';
      END IF;

      -- 13/08/2026: Pendente (em atraso)
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-08') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'pending', '2026-08-13'::date, 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-08-13'::date, membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-08' AND status <> 'paid';
      END IF;

      -- 13/09/2026: Pendente (em atraso)
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-09') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'pending', '2026-09-13'::date, 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-09-13'::date, membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-09' AND status <> 'paid';
      END IF;

      -- 13/10/2026: Pendente (em atraso)
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-10') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'pending', '2026-10-13'::date, 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-10-13'::date, membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-10' AND status <> 'paid';
      END IF;

      -- 13/11/2026: Pendente (a vencer / próximo vencimento)
      IF NOT EXISTS (SELECT 1 FROM payments WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-11') THEN
        INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, original_amount_cents, status, due_date, notes)
        VALUES (rec.gym_id, rec.member_id, v_mem_id, plan_price, plan_price, 'pending', '2026-11-13'::date, 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13');
      ELSE
        UPDATE payments SET due_date = '2026-11-13'::date, membership_id = v_mem_id, notes = 'Mensalidade ' || plan_title || ' - Vencimento todo dia 13'
        WHERE gym_id = rec.gym_id AND member_id = rec.member_id AND to_char(due_date, 'YYYY-MM') = '2026-11' AND status <> 'paid';
      END IF;

    END IF;
  END LOOP;
END $$;
