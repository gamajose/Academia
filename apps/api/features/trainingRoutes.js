const { recordAudit } = require('../lib/audit');
const { normalizeLevel, buildTrainingReview } = require('./trainingRules');

async function handleTrainingRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (!url.pathname.startsWith('/api/training')) return false;

  if (req.method === 'GET' && url.pathname === '/api/training/exercises') {
    const result = await query(
      'SELECT id, name, muscle_group, equipment, level, instructions, video_url, is_active, created_at FROM exercise_library WHERE gym_id = $1 ORDER BY muscle_group, name',
      [user.gym_id]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/exercises') {
    const input = await body(req);
    if (!input.name || !input.muscle_group) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      'INSERT INTO exercise_library (gym_id, name, muscle_group, equipment, level, instructions, video_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, muscle_group, equipment, level, instructions, video_url, is_active',
      [user.gym_id, input.name, input.muscle_group, input.equipment || null, normalizeLevel(input.level), input.instructions || null, input.video_url || null]
    );
    await recordAudit(user, 'create', 'exercise', result.rows[0].id, { name: result.rows[0].name });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/training/profile') {
    const input = await body(req);
    if (!input.member_id) return send(res, 400, { error: 'member_id_obrigatorio' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const result = await query(
      `INSERT INTO member_training_profiles (gym_id, member_id, level, goal, restrictions, training_days_per_week)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (gym_id, member_id) DO UPDATE SET level = EXCLUDED.level, goal = EXCLUDED.goal, restrictions = EXCLUDED.restrictions, training_days_per_week = EXCLUDED.training_days_per_week, updated_at = now()
       RETURNING id, member_id, level, goal, restrictions, training_days_per_week, updated_at`,
      [user.gym_id, input.member_id, normalizeLevel(input.level), input.goal || null, input.restrictions || null, Number(input.training_days_per_week || 3)]
    );
    await recordAudit(user, 'upsert', 'training_profile', result.rows[0].id, { member_id: input.member_id, level: result.rows[0].level });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/training/profile') {
    const memberId = url.searchParams.get('member_id');
    if (!memberId) return send(res, 400, { error: 'member_id_obrigatorio' });
    const result = await query('SELECT id, member_id, level, goal, restrictions, training_days_per_week, updated_at FROM member_training_profiles WHERE gym_id = $1 AND member_id = $2 LIMIT 1', [user.gym_id, memberId]);
    return send(res, 200, result.rows[0] || null);
  }

  return false;
}

module.exports = { handleTrainingRoutes };
