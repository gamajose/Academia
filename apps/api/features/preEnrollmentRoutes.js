async function handlePreEnrollmentRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/pre-enrollments') {
    const result = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.status, e.payment_method, e.enrollment_code, e.qr_payload, e.created_at, e.confirmed_at,
              p.name AS plan_name, p.price_cents, p.duration_days
       FROM public_enrollments e
       LEFT JOIN plans p ON p.id = e.plan_id
       WHERE e.gym_id = $1
       ORDER BY e.created_at DESC`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/pre-enrollments/confirm') {
    const input = await body(req);
    if (!input.enrollment_id) return send(res, 400, { error: 'id_obrigatorio' });

    const enrollment = await query(
      `SELECT e.*, p.duration_days, p.price_cents
       FROM public_enrollments e
       LEFT JOIN plans p ON p.id = e.plan_id
       WHERE e.id = $1 AND e.gym_id = $2
       LIMIT 1`,
      [input.enrollment_id, user.gym_id]
    );
    if (!enrollment.rowCount) return send(res, 404, { error: 'pre_matricula_nao_encontrada' });
    const item = enrollment.rows[0];

    const member = await query(
      `INSERT INTO members (gym_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name`,
      [user.gym_id, item.name, item.email || null, item.phone || null]
    );
    const memberId = member.rows[0].id;
    const duration = Number(item.duration_days || 30);
    const membership = await query(
      `INSERT INTO memberships (gym_id, member_id, plan_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, current_date, current_date + ($4 || ' days')::interval, 'active')
       RETURNING id`,
      [user.gym_id, memberId, item.plan_id, duration]
    );
    await query(
      `INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, due_date, paid_at, status)
       VALUES ($1, $2, $3, $4, current_date, now(), 'paid')`,
      [user.gym_id, memberId, membership.rows[0].id, Number(item.price_cents || 0)]
    );
    const updated = await query(
      `UPDATE public_enrollments SET status='confirmed', confirmed_at=now(), created_member_id=$3
       WHERE id=$1 AND gym_id=$2
       RETURNING id, status, enrollment_code, qr_payload, created_member_id`,
      [input.enrollment_id, user.gym_id, memberId]
    );
    return send(res, 200, updated.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/pre-enrollments/cancel') {
    const input = await body(req);
    if (!input.enrollment_id) return send(res, 400, { error: 'id_obrigatorio' });
    const result = await query(
      `UPDATE public_enrollments SET status='cancelled'
       WHERE id=$1 AND gym_id=$2
       RETURNING id, status`,
      [input.enrollment_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'pre_matricula_nao_encontrada' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/pre-enrollments/validate') {
    const code = url.searchParams.get('code') || '';
    const result = await query(
      `SELECT id, name, status, enrollment_code, qr_payload, created_member_id, confirmed_at
       FROM public_enrollments
       WHERE gym_id=$1 AND enrollment_code=$2
       LIMIT 1`,
      [user.gym_id, code]
    );
    if (!result.rowCount) return send(res, 404, { error: 'codigo_nao_encontrado' });
    const row = result.rows[0];
    return send(res, 200, { valid: row.status === 'confirmed', data: row });
  }

  return false;
}

module.exports = { handlePreEnrollmentRoutes };
