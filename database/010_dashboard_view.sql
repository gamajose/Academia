CREATE OR REPLACE VIEW gym_dashboard_totals AS
SELECT
  g.id AS gym_id,
  g.name AS gym_name,
  (SELECT count(*) FROM members m WHERE m.gym_id = g.id AND m.status = 'active') AS active_members,
  (SELECT count(*) FROM plans p WHERE p.gym_id = g.id AND p.is_active = true) AS active_plans,
  (SELECT count(*) FROM checkins c WHERE c.gym_id = g.id AND c.checked_at >= current_date) AS today_checkins,
  (SELECT count(*) FROM payments py WHERE py.gym_id = g.id AND py.status = 'pending') AS pending_payments
FROM gyms g;
