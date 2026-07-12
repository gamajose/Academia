async function handleOnlineSignupRoutes(req, res, user, url, helpers) {
  const { send, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/signups') {
    const result = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.status, e.payment_method, e.payment_provider, e.provider_payment_id, e.payment_status,
              e.payment_confirmed_at, e.enrollment_code, e.qr_payload, e.email_confirmed_at, e.created_at, e.confirmed_at,
              p.name AS plan_name, p.price_cents, p.duration_days
       FROM public_enrollments e
       LEFT JOIN plans p ON p.id = e.plan_id
       WHERE e.gym_id = $1
       ORDER BY e.created_at DESC`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/signups/approve') return send(res, 410, { error: 'aprovacao_manual_desativada' });

  if (req.method === 'GET' && url.pathname === '/api/signups/check') {
    const code = url.searchParams.get('code') || '';
    const result = await query('SELECT id, name, status, enrollment_code, qr_payload, created_member_id, confirmed_at FROM public_enrollments WHERE gym_id=$1 AND enrollment_code=$2 LIMIT 1', [user.gym_id, code]);
    if (!result.rowCount) return send(res, 404, { error: 'codigo_nao_encontrado' });
    return send(res, 200, { valid: result.rows[0].status === 'confirmed', data: result.rows[0] });
  }

  return false;
}

module.exports = { handleOnlineSignupRoutes };
