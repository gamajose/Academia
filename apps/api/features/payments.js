async function handlePayments(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/payments') {
    const result = await query(
      'SELECT p.id, p.member_id, m.name AS member_name, p.membership_id, p.amount_cents, p.status, p.due_date, p.paid_at, p.created_at FROM payments p INNER JOIN members m ON m.id = p.member_id WHERE p.gym_id = $1 ORDER BY p.due_date DESC LIMIT 100',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/payments') {
    const input = await body(req);
    if (!input.member_id || !input.amount_cents || !input.due_date) return send(res, 400, { error: 'dados_invalidos' });

    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const result = await query(
      'INSERT INTO payments (gym_id, member_id, membership_id, amount_cents, status, due_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, member_id, membership_id, amount_cents, status, due_date, created_at',
      [user.gym_id, input.member_id, input.membership_id || null, Number(input.amount_cents), input.status || 'pending', input.due_date]
    );
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/payments/mark-paid') {
    const input = await body(req);
    if (!input.payment_id) return send(res, 400, { error: 'payment_id_obrigatorio' });

    const result = await query(
      "UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, member_id, amount_cents, status, due_date, paid_at",
      [input.payment_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'pagamento_nao_encontrado' });
    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handlePayments };
