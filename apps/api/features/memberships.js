function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

async function handleMemberships(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/memberships') {
    const result = await query(
      'SELECT ms.id, ms.member_id, m.name AS member_name, ms.plan_id, p.name AS plan_name, ms.starts_at, ms.ends_at, ms.status, ms.created_at FROM memberships ms INNER JOIN members m ON m.id = ms.member_id INNER JOIN plans p ON p.id = ms.plan_id WHERE ms.gym_id = $1 ORDER BY ms.created_at DESC LIMIT 100',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/memberships') {
    const input = await body(req);
    if (!input.member_id || !input.plan_id) return send(res, 400, { error: 'member_id_e_plan_id_obrigatorios' });

    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 AND status = $3', [input.member_id, user.gym_id, 'active']);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const plan = await query('SELECT id, duration_days FROM plans WHERE id = $1 AND gym_id = $2 AND is_active = true', [input.plan_id, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });

    const startsAt = input.starts_at || new Date().toISOString().slice(0, 10);
    const endsAt = input.ends_at || addDays(startsAt, plan.rows[0].duration_days);

    const result = await query(
      'INSERT INTO memberships (gym_id, member_id, plan_id, starts_at, ends_at, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, member_id, plan_id, starts_at, ends_at, status, created_at',
      [user.gym_id, input.member_id, input.plan_id, startsAt, endsAt, input.status || 'active']
    );
    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleMemberships };
