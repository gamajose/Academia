const { buildSimplePdf } = require('../lib/simplePdf');

async function handleReportsRoutes(req, res, user, url, helpers) {
  const { send, query, body } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/reports/overview') {
    const result = await query(
      "SELECT (SELECT count(*) FROM members WHERE gym_id = $1) AS total_members, (SELECT count(*) FROM members WHERE gym_id = $1 AND status = 'active') AS active_members, (SELECT count(*) FROM memberships WHERE gym_id = $1 AND status = 'active') AS active_memberships, (SELECT count(*) FROM payments WHERE gym_id = $1 AND status = 'pending') AS pending_payments, (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status = 'pending') AS pending_amount_cents, (SELECT COALESCE(sum(amount_cents), 0) FROM payments WHERE gym_id = $1 AND status = 'paid') AS paid_amount_cents",
      [user.gym_id]
    );
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/student-accounts') {
    const result = await query(
      `SELECT ma.id, ma.member_id, m.name AS member_name, ma.email, ma.is_active, ma.last_login_at, ma.created_at, ma.updated_at
       FROM member_accounts ma INNER JOIN members m ON m.id = ma.member_id
       WHERE ma.gym_id = $1 ORDER BY m.name ASC LIMIT 200`,
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/reports/student-account-status') {
    const input = await body(req);
    if (!input.account_id || typeof input.is_active !== 'boolean') return send(res, 400, { error: 'dados_invalidos' });
    const result = await query('UPDATE member_accounts SET is_active = $3, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING id, member_id, email, is_active, updated_at', [input.account_id, user.gym_id, input.is_active]);
    if (!result.rowCount) return send(res, 404, { error: 'conta_nao_encontrada' });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/financial') {
    const result = await query(
      "SELECT p.id, m.name AS member_name, p.amount_cents, p.status, p.due_date, p.paid_at, p.created_at FROM payments p INNER JOIN members m ON m.id = p.member_id WHERE p.gym_id = $1 ORDER BY p.due_date DESC LIMIT 200",
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/finance-advanced') {
    const result = await query(
      `SELECT p.id, p.member_id, m.name AS member_name, m.email AS member_email, m.phone, p.membership_id, p.original_amount_cents, p.amount_cents, p.discount_cents, p.fee_cents, p.method, p.notes, p.status, p.due_date, p.paid_at, p.created_at, p.updated_at
       FROM payments p INNER JOIN members m ON m.id = p.member_id
       WHERE p.gym_id = $1 ORDER BY p.due_date DESC LIMIT 250`,
      [user.gym_id]
    );
    const summary = await query(
      "SELECT count(*) FILTER (WHERE status = 'pending') AS pending_count, count(*) FILTER (WHERE status = 'paid') AS paid_count, COALESCE(sum(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_amount_cents, COALESCE(sum(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_amount_cents FROM payments WHERE gym_id = $1",
      [user.gym_id]
    );
    return send(res, 200, { summary: summary.rows[0], data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/reports/finance-adjust') {
    const input = await body(req);
    if (!input.payment_id) return send(res, 400, { error: 'payment_id_obrigatorio' });
    const current = await query('SELECT original_amount_cents, amount_cents FROM payments WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.payment_id, user.gym_id]);
    if (!current.rowCount) return send(res, 404, { error: 'pagamento_nao_encontrado' });
    const base = Number(current.rows[0].original_amount_cents || current.rows[0].amount_cents || 0);
    const discount = Number(input.discount_cents || 0);
    const fee = Number(input.fee_cents || 0);
    const amount = Math.max(0, base - discount + fee);
    const result = await query(
      `UPDATE payments SET amount_cents = $3, discount_cents = $4, fee_cents = $5, method = COALESCE($6, method), notes = COALESCE($7, notes), updated_at = now()
       WHERE id = $1 AND gym_id = $2 RETURNING id, member_id, original_amount_cents, amount_cents, discount_cents, fee_cents, method, notes, status, due_date`,
      [input.payment_id, user.gym_id, amount, discount, fee, input.method || null, input.notes || null]
    );
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/memberships') {
    const result = await query(
      "SELECT ms.id, m.name AS member_name, p.name AS plan_name, ms.starts_at, ms.ends_at, ms.status, ms.created_at FROM memberships ms INNER JOIN members m ON m.id = ms.member_id INNER JOIN plans p ON p.id = ms.plan_id WHERE ms.gym_id = $1 ORDER BY ms.created_at DESC LIMIT 200",
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/student-pdf') {
    const memberId = url.searchParams.get('member_id');
    if (!memberId) return send(res, 400, { error: 'member_id_obrigatorio' });
    const member = await query('SELECT id, name, email, phone, status FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1', [memberId, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const assessments = await query('SELECT assessment_date, weight_kg, body_fat_percent, waist_cm, notes FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC LIMIT 8', [user.gym_id, memberId]);
    const goals = await query('SELECT goal_type, target_value, target_date, status FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY status, target_date NULLS LAST LIMIT 8', [user.gym_id, memberId]);
    const lines = [`Aluno: ${member.rows[0].name}`, `Email: ${member.rows[0].email || '-'}`, `Telefone: ${member.rows[0].phone || '-'}`, `Status: ${member.rows[0].status}`, '', 'Avaliacoes:', ...assessments.rows.map((item) => `${item.assessment_date} | Peso ${item.weight_kg || '-'}kg | Gordura ${item.body_fat_percent || '-'}% | Cintura ${item.waist_cm || '-'}cm`), '', 'Metas:', ...goals.rows.map((item) => `${item.goal_type} | Alvo ${item.target_value || '-'} | Data ${item.target_date || '-'} | ${item.status}`)];
    const pdf = buildSimplePdf(`Relatorio do aluno - ${member.rows[0].name}`, lines);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="relatorio-aluno-${memberId}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
    return true;
  }

  return false;
}

module.exports = { handleReportsRoutes };
