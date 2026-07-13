const { buildTrainingReview } = require('./trainingRules');

async function handleTrainingAdvancedRoutes(req, res, user, url, helpers) {
  const { send, query, body } = helpers;
  if (!url.pathname.startsWith('/api/training/advanced')) return false;

  if (req.method === 'GET' && url.pathname === '/api/training/advanced/detail') {
    const planId = url.searchParams.get('plan_id');
    if (!planId) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const plan = await query('SELECT id, member_id, name, level, goal, status, starts_at, current_date - starts_at AS age_days FROM workout_plans WHERE id = $1 AND gym_id = $2 LIMIT 1', [planId, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const days = await query('SELECT id, weekday, title, notes FROM workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday, created_at', [user.gym_id, planId]);
    const exercises = await query(
      `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.id AS exercise_id, e.name AS exercise_name, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary, e.video_url, e.instructions
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

  return false;
}

module.exports = { handleTrainingAdvancedRoutes };
