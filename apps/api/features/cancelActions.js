async function handleCancelActions(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'POST' && url.pathname === '/api/memberships/cancel') {
    const input = await body(req);
    if (!input.membership_id) return send(res, 400, { error: 'membership_id_obrigatorio' });
    const result = await query("UPDATE memberships SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, member_id, plan_id, status, cancelled_at", [input.membership_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'matricula_nao_encontrada' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/payments/cancel') {
    const input = await body(req);
    if (!input.payment_id) return send(res, 400, { error: 'payment_id_obrigatorio' });
    const result = await query("UPDATE payments SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 AND gym_id = $2 AND status <> 'paid' RETURNING id, member_id, amount_cents, status, due_date, cancelled_at", [input.payment_id, user.gym_id]);
    if (!result.rowCount) return send(res, 404, { error: 'pagamento_nao_encontrado_ou_ja_pago' });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handleCancelActions };
