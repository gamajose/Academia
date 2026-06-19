async function handlePlanActions(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'POST' && url.pathname === '/api/plans/update') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query(
      'UPDATE plans SET name = COALESCE($3, name), price_cents = COALESCE($4, price_cents), duration_days = COALESCE($5, duration_days), updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, price_cents, duration_days, is_active, updated_at',
      [input.plan_id, user.gym_id, input.name || null, input.price_cents == null ? null : Number(input.price_cents), input.duration_days == null ? null : Number(input.duration_days)]
    );
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/deactivate') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query('UPDATE plans SET is_active = false, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, is_active, updated_at', [input.plan_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/plans/activate') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query('UPDATE plans SET is_active = true, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, name, is_active, updated_at', [input.plan_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handlePlanActions };
