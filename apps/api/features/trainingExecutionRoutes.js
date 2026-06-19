const { recordAudit } = require('../lib/audit');

async function handleTrainingExecutionRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (!url.pathname.startsWith('/api/training/execution')) return false;

  if (req.method === 'GET' && url.pathname === '/api/training/execution/logs') {
    const memberId = url.searchParams.get('member_id');
    const result = await query(
      `SELECT l.id, l.member_id, m.name AS member_name, l.plan_id, p.name AS plan_name, l.workout_day_id, d.title AS day_title, l.status, l.feedback, l.perceived_effort, l.completed_at
       FROM workout_day_logs l
       INNER JOIN members m ON m.id = l.member_id
       INNER JOIN workout_plans p ON p.id = l.plan_id
       INNER JOIN workout_days d ON d.id = l.workout_day_id
       WHERE l.gym_id = $1 AND ($2::uuid IS NULL OR l.member_id = $2::uuid)
       ORDER BY l.completed_at DESC LIMIT 100`,
      [user.gym_id, memberId || null]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/execution/day') {
    const input = await body(req);
    if (!input.plan_id || !input.workout_day_id || !input.member_id) return send(res, 400, { error: 'dados_invalidos' });

    const valid = await query(
      `SELECT wd.id FROM workout_days wd INNER JOIN workout_plans wp ON wp.id = wd.plan_id
       WHERE wd.id = $1 AND wd.gym_id = $2 AND wp.id = $3 AND wp.member_id = $4`,
      [input.workout_day_id, user.gym_id, input.plan_id, input.member_id]
    );
    if (!valid.rowCount) return send(res, 404, { error: 'treino_nao_encontrado' });

    const result = await query(
      `INSERT INTO workout_day_logs (gym_id, member_id, plan_id, workout_day_id, status, feedback, perceived_effort, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, member_id, plan_id, workout_day_id, status, feedback, perceived_effort, completed_at`,
      [user.gym_id, input.member_id, input.plan_id, input.workout_day_id, input.status || 'completed', input.feedback || null, input.perceived_effort == null ? null : Number(input.perceived_effort), user.sub]
    );
    await recordAudit(user, 'complete', 'workout_day', result.rows[0].id, { member_id: input.member_id, plan_id: input.plan_id });
    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleTrainingExecutionRoutes };
