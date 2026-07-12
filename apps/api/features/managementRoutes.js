const { hasModulePermission } = require('../lib/accessControl');

function isManager(user, module = 'reports') {
  return hasModulePermission(user, module);
}

function canCoach(user) {
  return user && ['owner', 'admin', 'staff'].includes(user.role);
}

function reportDays(value) {
  const parsed = Number.parseInt(String(value || 30), 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(7, parsed));
}

function boundedInteger(value, fallback, min = 0, max = 100000000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

async function upcomingSessions(res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT cs.id AS session_id, cs.starts_at, cs.ends_at, cs.capacity, cs.status, cs.notes,
            gc.id AS class_id, gc.name, gc.room, gc.level,
            u.name AS instructor_name,
            count(cr.id) FILTER (WHERE cr.status IN ('confirmed','attended'))::integer AS confirmed,
            count(cr.id) FILTER (WHERE cr.status = 'waitlist')::integer AS waitlist,
            count(cr.id) FILTER (WHERE cr.status = 'attended')::integer AS attended
     FROM class_sessions cs
     INNER JOIN gym_classes gc ON gc.id = cs.class_id
     LEFT JOIN users u ON u.id = COALESCE(cs.instructor_id, gc.instructor_id)
     LEFT JOIN class_reservations cr ON cr.session_id = cs.id
     WHERE cs.gym_id = $1 AND cs.starts_at >= now() - interval '1 day'
     GROUP BY cs.id, gc.id, u.name
     ORDER BY cs.starts_at
     LIMIT 200`,
    [user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function reportsOverview(res, user, url, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const days = reportDays(url.searchParams.get('days'));
  const [summary, daily, plans, overdue, hours] = await Promise.all([
    helpers.query(
      `SELECT
         (SELECT count(*) FROM members WHERE gym_id = $1 AND status = 'active')::integer AS active_members,
         (SELECT count(*) FROM members WHERE gym_id = $1 AND created_at >= now() - ($2::integer * interval '1 day'))::integer AS new_members,
         (SELECT count(*) FROM checkins WHERE gym_id = $1 AND checked_at >= now() - ($2::integer * interval '1 day'))::integer AS checkins,
         (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status = 'paid' AND paid_at >= now() - ($2::integer * interval '1 day'))::bigint AS received_cents,
         (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status IN ('pending','overdue'))::bigint AS outstanding_cents,
         (SELECT count(*) FROM payments WHERE gym_id = $1 AND status IN ('pending','overdue') AND due_date < current_date)::integer AS overdue_payments,
         (SELECT count(*) FROM class_reservations WHERE gym_id = $1 AND status IN ('confirmed','attended') AND created_at >= now() - ($2::integer * interval '1 day'))::integer AS class_reservations`,
      [user.gym_id, days]
    ),
    helpers.query(
      `SELECT day::date,
              (SELECT count(*)::integer FROM checkins c
               WHERE c.gym_id = $1 AND c.checked_at >= day AND c.checked_at < day + interval '1 day') AS checkins,
              (SELECT COALESCE(sum(p.amount_cents), 0)::bigint FROM payments p
               WHERE p.gym_id = $1 AND p.status = 'paid'
                 AND p.paid_at >= day AND p.paid_at < day + interval '1 day') AS received_cents
       FROM generate_series(current_date - ($2::integer - 1), current_date, interval '1 day') day
       ORDER BY day`,
      [user.gym_id, days]
    ),
    helpers.query(
      `SELECT p.id, p.name, count(ms.id)::integer AS memberships
       FROM plans p
       LEFT JOIN memberships ms ON ms.plan_id = p.id AND ms.status = 'active'
       WHERE p.gym_id = $1
       GROUP BY p.id
       ORDER BY memberships DESC, p.name
       LIMIT 10`,
      [user.gym_id]
    ),
    helpers.query(
      `SELECT m.id, m.name, min(p.due_date) AS oldest_due_date,
              count(p.id)::integer AS invoices,
              COALESCE(sum(p.amount_cents), 0)::bigint AS total_cents
       FROM payments p
       INNER JOIN members m ON m.id = p.member_id
       WHERE p.gym_id = $1 AND p.status IN ('pending','overdue') AND p.due_date < current_date
       GROUP BY m.id
       ORDER BY oldest_due_date
       LIMIT 50`,
      [user.gym_id]
    ),
    helpers.query(
      `SELECT extract(hour FROM checked_at)::integer AS hour, count(*)::integer AS checkins
       FROM checkins
       WHERE gym_id = $1 AND checked_at >= now() - ($2::integer * interval '1 day')
       GROUP BY extract(hour FROM checked_at)
       ORDER BY hour`,
      [user.gym_id, days]
    )
  ]);

  return helpers.send(res, 200, {
    days,
    summary: summary.rows[0],
    daily: daily.rows,
    plans: plans.rows,
    overdue_members: overdue.rows,
    checkins_by_hour: hours.rows
  });
}

async function listCommercialPlans(res, user, helpers) {
  if (!isManager(user, 'plans')) return helpers.send(res, 403, { error: 'sem_permissao' });
  const result = await helpers.query(
    `SELECT id, name, description, price_cents, duration_days, enrollment_fee_cents,
            billing_period, access_rules, services_included, auto_renew,
            cancellation_fee_cents, trial_days, is_featured, is_active, updated_at
     FROM plans WHERE gym_id = $1 ORDER BY is_featured DESC, name`,
    [user.gym_id]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function saveCommercialPlan(req, res, user, helpers) {
  if (!isManager(user, 'plans')) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.plan_id || !input.name) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const result = await helpers.query(
    `UPDATE plans SET
       name = $3, description = $4, price_cents = $5, duration_days = $6,
       enrollment_fee_cents = $7, billing_period = $8, access_rules = $9::jsonb,
       services_included = $10::jsonb, auto_renew = $11,
       cancellation_fee_cents = $12, trial_days = $13,
       is_featured = $14, is_active = $15, updated_at = now()
     WHERE id = $1 AND gym_id = $2
     RETURNING *`,
    [
      input.plan_id,
      user.gym_id,
      String(input.name).trim(),
      input.description || null,
      boundedInteger(input.price_cents, 0),
      boundedInteger(input.duration_days, 30, 1, 3650),
      boundedInteger(input.enrollment_fee_cents, 0),
      input.billing_period || 'monthly',
      JSON.stringify(input.access_rules || {}),
      JSON.stringify(input.services_included || []),
      input.auto_renew === true,
      boundedInteger(input.cancellation_fee_cents, 0),
      boundedInteger(input.trial_days, 0, 0, 365),
      input.is_featured === true,
      input.is_active !== false
    ]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'plano_nao_encontrado' });
  return helpers.send(res, 200, result.rows[0]);
}

async function handleManagementRoutes(req, res, user, url, helpers) {
  if (!user) return false;
  if (req.method === 'GET' && url.pathname === '/api/classes/sessions/upcoming') return upcomingSessions(res, user, helpers);
  if (req.method === 'GET' && url.pathname === '/api/reports/overview') return reportsOverview(res, user, url, helpers);
  if (req.method === 'GET' && url.pathname === '/api/plans/commercial') return listCommercialPlans(res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/plans/commercial') return saveCommercialPlan(req, res, user, helpers);
  return false;
}

module.exports = { handleManagementRoutes, reportDays, boundedInteger };
