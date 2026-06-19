async function handleReportsRoutes(req, res, user, url, helpers) {
  const { send, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/reports/overview') {
    const result = await query(
      "SELECT (SELECT count(*) FROM members WHERE gym_id = $1) AS total_members, (SELECT count(*) FROM members WHERE gym_id = $1 AND status = 'active') AS active_members, (SELECT count(*) FROM memberships WHERE gym_id = $1 AND status = 'active') AS active_memberships, (SELECT count(*) FROM payments WHERE gym_id = $1 AND status = 'pending') AS pending_payments, (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status = 'pending') AS pending_amount_cents, (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status = 'paid') AS paid_amount_cents",
      [user.gym_id]
    );
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/financial') {
    const result = await query(
      "SELECT p.id, m.name AS member_name, p.amount_cents, p.status, p.due_date, p.paid_at, p.created_at FROM payments p INNER JOIN members m ON m.id = p.member_id WHERE p.gym_id = $1 ORDER BY p.due_date DESC LIMIT 200",
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/memberships') {
    const result = await query(
      "SELECT ms.id, m.name AS member_name, p.name AS plan_name, ms.starts_at, ms.ends_at, ms.status, ms.created_at FROM memberships ms INNER JOIN members m ON m.id = ms.member_id INNER JOIN plans p ON p.id = ms.plan_id WHERE ms.gym_id = $1 ORDER BY ms.created_at DESC LIMIT 200",
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  return false;
}

module.exports = { handleReportsRoutes };
