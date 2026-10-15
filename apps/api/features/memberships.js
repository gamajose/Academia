const { syncMembershipInvoices } = require('./studentInvoiceRoutes');

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

async function handleMemberships(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/memberships') {
    const result = await query(
      'SELECT ms.id, ms.member_id, m.name AS member_name, ms.plan_id, p.name AS plan_name, p.price_cents AS plan_price_cents, ms.starts_at::text AS starts_at, ms.ends_at::text AS ends_at, ms.due_day, ms.status, ms.created_at FROM memberships ms INNER JOIN members m ON m.id = ms.member_id INNER JOIN plans p ON p.id = ms.plan_id WHERE ms.gym_id = $1 ORDER BY ms.created_at DESC LIMIT 100',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/memberships/update') {
    const input = await body(req);
    if (!input.membership_id || !input.plan_id) return send(res, 400, { error: 'matricula_e_plano_obrigatorios' });
    const current = await query('SELECT id, member_id, starts_at, due_day, status FROM memberships WHERE id = $1 AND gym_id = $2', [input.membership_id, user.gym_id]);
    if (!current.rowCount) return send(res, 404, { error: 'matricula_nao_encontrada' });
    const plan = await query('SELECT id, name, price_cents, duration_days FROM plans WHERE id = $1 AND gym_id = $2 AND is_active = true', [input.plan_id, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });
    const startsAt = input.starts_at ? String(input.starts_at).slice(0, 10) : String(current.rows[0].starts_at).slice(0, 10);
    const endsAt = input.ends_at || addDays(startsAt, plan.rows[0].duration_days);
    const dueDay = (!isNaN(parseInt(input.due_day, 10)) && parseInt(input.due_day, 10) >= 1 && parseInt(input.due_day, 10) <= 31)
      ? parseInt(input.due_day, 10)
      : (current.rows[0].due_day || parseInt(startsAt.split('-')[2], 10) || 13);

    const result = await query(
      'UPDATE memberships SET plan_id = $3, starts_at = $4, ends_at = $5, due_day = $6, status = $7 WHERE id = $1 AND gym_id = $2 RETURNING id, member_id, plan_id, starts_at, ends_at, due_day, status, created_at',
      [input.membership_id, user.gym_id, input.plan_id, startsAt, endsAt, dueDay, input.status || current.rows[0].status || 'active']
    );

    await query('UPDATE members SET due_day = $1 WHERE id = $2 AND gym_id = $3', [dueDay, current.rows[0].member_id, user.gym_id]);

    await syncMembershipInvoices({
      query,
      gymId: user.gym_id,
      memberId: current.rows[0].member_id,
      activeMem: {
        id: result.rows[0].id,
        starts_at: startsAt,
        due_day: dueDay,
        plan_name: plan.rows[0].name,
        price_cents: plan.rows[0].price_cents
      },
      dueDay,
      today: new Date()
    });

    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/memberships') {
    const input = await body(req);
    if (!input.member_id || !input.plan_id) return send(res, 400, { error: 'member_id_e_plan_id_obrigatorios' });

    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 AND status = $3', [input.member_id, user.gym_id, 'active']);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const plan = await query('SELECT id, name, price_cents, duration_days FROM plans WHERE id = $1 AND gym_id = $2 AND is_active = true', [input.plan_id, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'plano_nao_encontrado' });

    const startsAt = input.starts_at ? String(input.starts_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const endsAt = input.ends_at || addDays(startsAt, plan.rows[0].duration_days);
    const dueDay = (!isNaN(parseInt(input.due_day, 10)) && parseInt(input.due_day, 10) >= 1 && parseInt(input.due_day, 10) <= 31)
      ? parseInt(input.due_day, 10)
      : (parseInt(startsAt.split('-')[2], 10) || 13);

    const result = await query(
      'INSERT INTO memberships (gym_id, member_id, plan_id, starts_at, ends_at, due_day, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, member_id, plan_id, starts_at, ends_at, due_day, status, created_at',
      [user.gym_id, input.member_id, input.plan_id, startsAt, endsAt, dueDay, input.status || 'active']
    );

    await query('UPDATE members SET due_day = $1, enrollment_date = $2 WHERE id = $3 AND gym_id = $4', [dueDay, startsAt, input.member_id, user.gym_id]);

    await syncMembershipInvoices({
      query,
      gymId: user.gym_id,
      memberId: input.member_id,
      activeMem: {
        id: result.rows[0].id,
        starts_at: startsAt,
        due_day: dueDay,
        plan_name: plan.rows[0].name,
        price_cents: plan.rows[0].price_cents
      },
      dueDay,
      today: new Date()
    });

    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleMemberships };
