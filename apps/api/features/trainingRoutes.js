const { recordAudit } = require('../lib/audit');
const { normalizeLevel, buildTrainingReview } = require('./trainingRules');

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function handleTrainingRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (!url.pathname.startsWith('/api/training')) return false;

  if (req.method === 'GET' && url.pathname === '/api/training/advanced/detail') {
    const planId = url.searchParams.get('plan_id');
    if (!planId) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const plan = await query('SELECT id, member_id, name, level, goal, status, starts_at, current_date - starts_at AS age_days FROM workout_plans WHERE id = $1 AND gym_id = $2 LIMIT 1', [planId, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const days = await query('SELECT id, weekday, title, notes FROM workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday, created_at', [user.gym_id, planId]);
    const exercises = await query(
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.id AS exercise_id, e.name AS exercise_name, e.muscle_group, e.video_url, e.instructions
       FROM workout_exercises we INNER JOIN workout_days wd ON wd.id = we.workout_day_id INNER JOIN exercise_library e ON e.id = we.exercise_id
       WHERE we.gym_id = $1 AND wd.plan_id = $2 ORDER BY wd.weekday, we.order_index`,
      [user.gym_id, planId]
    );
    return send(res, 200, { plan: plan.rows[0], days: days.rows, exercises: exercises.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/advanced/review') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const plan = await query('SELECT id, member_id, level, current_date - starts_at AS age_days FROM workout_plans WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.plan_id, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const exercises = await query(
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, wd.weekday, e.name AS exercise_name, e.muscle_group
       FROM workout_exercises we INNER JOIN workout_days wd ON wd.id = we.workout_day_id INNER JOIN exercise_library e ON e.id = we.exercise_id
       WHERE we.gym_id = $1 AND wd.plan_id = $2 ORDER BY wd.weekday, we.order_index`,
      [user.gym_id, input.plan_id]
    );
    const logs = await query('SELECT perceived_effort, completed_at FROM workout_day_logs WHERE gym_id = $1 AND member_id = $2 AND plan_id = $3 ORDER BY completed_at DESC LIMIT 30', [user.gym_id, plan.rows[0].member_id, input.plan_id]);
    const assessments = await query('SELECT weight_kg, body_fat_percent, waist_cm, assessment_date FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 2', [user.gym_id, plan.rows[0].member_id]);
    const review = buildTrainingReview({ planAgeDays: Number(plan.rows[0].age_days || 0), level: plan.rows[0].level, exercises: exercises.rows, logs: logs.rows, assessments: assessments.rows });
    const saved = await query('INSERT INTO workout_ai_reviews (gym_id, member_id, plan_id, plan_age_days, recommendation, suggestions) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, recommendation, suggestions, created_at', [user.gym_id, plan.rows[0].member_id, input.plan_id, Number(plan.rows[0].age_days || 0), review.recommendation, JSON.stringify(review.suggestions)]);
    await query('UPDATE workout_plans SET reviewed_at = now() WHERE id = $1 AND gym_id = $2', [input.plan_id, user.gym_id]);
    return send(res, 201, { ...saved.rows[0], signals: review.signals || {} });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/goals/status') {
    const input = await body(req);
    const allowed = ['active', 'completed', 'cancelled'];
    if (!input.goal_id || !allowed.includes(input.status)) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query('UPDATE member_goals SET status = $3, updated_at = now() WHERE id = $1 AND gym_id = $2 RETURNING *', [input.goal_id, user.gym_id, input.status]);
    if (!result.rowCount) return send(res, 404, { error: 'meta_nao_encontrada' });
    await recordAudit(user, 'update_status', 'member_goal', result.rows[0].id, { status: input.status });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/training/assessments/update') {
    const input = await body(req);
    if (!input.assessment_id) return send(res, 400, { error: 'assessment_id_obrigatorio' });
    const result = await query(
      `UPDATE member_assessments SET weight_kg = COALESCE($3, weight_kg), body_fat_percent = COALESCE($4, body_fat_percent), waist_cm = COALESCE($5, waist_cm), notes = COALESCE($6, notes)
       WHERE id = $1 AND gym_id = $2 RETURNING *`,
      [input.assessment_id, user.gym_id, numberOrNull(input.weight_kg), numberOrNull(input.body_fat_percent), numberOrNull(input.waist_cm), input.notes || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'avaliacao_nao_encontrada' });
    await recordAudit(user, 'update', 'member_assessment', result.rows[0].id, { member_id: result.rows[0].member_id });
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/training/exercises') {
    const result = await query('SELECT id, name, muscle_group, equipment, level, instructions, video_url, is_active, created_at FROM exercise_library WHERE gym_id = $1 ORDER BY muscle_group, name', [user.gym_id]);
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/exercises') {
    const input = await body(req);
    if (!input.name || !input.muscle_group) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query('INSERT INTO exercise_library (gym_id, name, muscle_group, equipment, level, instructions, video_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, muscle_group, equipment, level, instructions, video_url, is_active', [user.gym_id, input.name, input.muscle_group, input.equipment || null, normalizeLevel(input.level), input.instructions || null, input.video_url || null]);
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
