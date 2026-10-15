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

    const method = input.method || 'cash';
    const notes = input.notes || 'Recebido presencialmente na recepção pelo administrador';

    const result = await query(
      "UPDATE payments SET status = 'paid', paid_at = now(), method = $1, notes = CASE WHEN notes IS NOT NULL AND notes <> '' THEN notes || ' | ' || $2 ELSE $2 END WHERE id = $3 AND gym_id = $4 RETURNING id, member_id, amount_cents, status, due_date, paid_at, method, notes",
      [method, notes, input.payment_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'pagamento_nao_encontrado' });

    try {
      const cash = await query("SELECT id FROM cash_sessions WHERE gym_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1", [user.gym_id]);
      if (cash.rowCount) {
        const member = await query('SELECT name FROM members WHERE id = $1', [result.rows[0].member_id]);
        const memberName = member.rowCount ? member.rows[0].name : 'Aluno';
        await query(
          `INSERT INTO cash_movements(gym_id, cash_session_id, payment_id, movement_type, amount_cents, description, created_by)
           VALUES($1, $2, $3, 'income', $4, $5, $6)`,
          [user.gym_id, cash.rows[0].id, input.payment_id, result.rows[0].amount_cents, `Recebimento (${method}) - ${memberName}`, user.sub]
        );
      }
    } catch (_) {}

    // Ativa aluno caso estivesse inativo
    try {
      await query(
        "UPDATE members SET status = 'active', updated_at = now() WHERE id = $1 AND gym_id = $2 AND status = 'inactive'",
        [result.rows[0].member_id, user.gym_id]
      );
    } catch (_) {}

    return send(res, 200, result.rows[0]);
  }

  return false;
}

module.exports = { handlePayments };
