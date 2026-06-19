const { buildSimplePdf } = require('../lib/simplePdf');

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

  if (req.method === 'GET' && url.pathname === '/api/reports/student-pdf') {
    const memberId = url.searchParams.get('member_id');
    if (!memberId) return send(res, 400, { error: 'member_id_obrigatorio' });
    const member = await query('SELECT id, name, email, phone, status FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1', [memberId, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const assessments = await query('SELECT assessment_date, weight_kg, body_fat_percent, waist_cm, notes FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC LIMIT 8', [user.gym_id, memberId]);
    const goals = await query('SELECT goal_type, target_value, target_date, status FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY status, target_date NULLS LAST LIMIT 8', [user.gym_id, memberId]);
    const lines = [
      `Aluno: ${member.rows[0].name}`,
      `Email: ${member.rows[0].email || '-'}`,
      `Telefone: ${member.rows[0].phone || '-'}`,
      `Status: ${member.rows[0].status}`,
      '',
      'Avaliacoes:',
      ...assessments.rows.map((item) => `${item.assessment_date} | Peso ${item.weight_kg || '-'}kg | Gordura ${item.body_fat_percent || '-'}% | Cintura ${item.waist_cm || '-'}cm`),
      '',
      'Metas:',
      ...goals.rows.map((item) => `${item.goal_type} | Alvo ${item.target_value || '-'} | Data ${item.target_date || '-'} | ${item.status}`)
    ];
    const pdf = buildSimplePdf(`Relatorio do aluno - ${member.rows[0].name}`, lines);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio-aluno-${memberId}.pdf"`,
      'Content-Length': pdf.length
    });
    res.end(pdf);
    return true;
  }

  return false;
}

module.exports = { handleReportsRoutes };
