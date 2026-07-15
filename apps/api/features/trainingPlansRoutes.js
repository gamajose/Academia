const { recordAudit } = require('../lib/audit');
const { buildTrainingReview } = require('./trainingRules');
const { resolveTrainingLevel } = require('./trainingRoutes');

async function planExercises(query, gymId, planId) {
  const result = await query(
    `SELECT we.id, we.sets, we.reps, we.rest_seconds, we.load_hint, we.notes, wd.id AS workout_day_id, wd.weekday, wd.title AS day_title, e.id AS exercise_id, e.name AS exercise_name, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary, e.video_url, e.image_url, e.instructions
     FROM workout_exercises we
     INNER JOIN workout_days wd ON wd.id = we.workout_day_id
     INNER JOIN exercise_library e ON e.id = we.exercise_id
     WHERE we.gym_id = $1 AND wd.plan_id = $2
     ORDER BY wd.weekday, we.order_index`,
    [gymId, planId]
  );
  return result.rows;
}

async function handleTrainingPlansRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;
  if (!url.pathname.startsWith('/api/training/plans')) return false;

  if (req.method === 'GET' && url.pathname === '/api/training/plans') {
    const memberId = url.searchParams.get('member_id');
    const result = await query(
      `SELECT wp.id, wp.member_id, m.name AS member_name, wp.name, wp.level, wp.goal, wp.status, wp.starts_at, wp.reviewed_at, wp.created_at,
       current_date - wp.starts_at AS age_days
       FROM workout_plans wp INNER JOIN members m ON m.id = wp.member_id
       WHERE wp.gym_id = $1 AND wp.status = 'active' AND ($2::uuid IS NULL OR wp.member_id = $2::uuid)
       ORDER BY wp.created_at DESC LIMIT 100`,
      [user.gym_id, memberId || null]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/plans') {
    const input = await body(req);
    if (!input.member_id || !input.name) return send(res, 400, { error: 'dados_invalidos' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const result = await query(
      'INSERT INTO workout_plans (gym_id, member_id, name, level, goal, starts_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, current_date)) RETURNING id, member_id, name, level, goal, status, starts_at, created_at',
      [user.gym_id, input.member_id, input.name, await resolveTrainingLevel(query, user.gym_id, input.level), input.goal || null, input.starts_at || null]
    );
    await recordAudit(user, 'create', 'workout_plan', result.rows[0].id, { member_id: input.member_id, level: result.rows[0].level });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/training/plans/update') {
    const input = await body(req);
    if (!input.plan_id || !input.member_id || !input.name || !Array.isArray(input.days)) return send(res, 400, { error: 'dados_invalidos' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const existing = await query('SELECT id FROM workout_plans WHERE id = $1 AND gym_id = $2', [input.plan_id, user.gym_id]);
    if (!existing.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });

    const dayRows = input.days.map((day) => ({
      ...day,
      weekday: Number(day.weekday),
      exercises: Array.isArray(day.exercises) ? day.exercises : null
    }));
    if (dayRows.some((day) => !Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7 || !day.exercises)) {
      return send(res, 400, { error: 'dia_invalido' });
    }
    if (new Set(dayRows.map((day) => day.weekday)).size !== dayRows.length) {
      return send(res, 400, { error: 'dia_duplicado' });
    }
    const exerciseIds = [...new Set(dayRows.flatMap((day) => day.exercises.map((exercise) => exercise.exercise_id).filter(Boolean)))];
    if (dayRows.some((day) => day.exercises.some((exercise) => !exercise.exercise_id))) {
      return send(res, 400, { error: 'exercicio_invalido' });
    }
    if (exerciseIds.length) {
      const validExercises = await query(
        `SELECT id FROM exercise_library
         WHERE gym_id = $1 AND is_active = true AND id = ANY($2::uuid[])`,
        [user.gym_id, exerciseIds]
      );
      if (validExercises.rowCount !== exerciseIds.length) return send(res, 404, { error: 'exercicio_nao_encontrado' });
    }

    const saved = await query(
      `UPDATE workout_plans
       SET member_id = $3, name = $4, level = $5, goal = $6, starts_at = COALESCE($7::date, starts_at), status = 'active', updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, member_id, name, level, goal, status, starts_at, created_at`,
      [input.plan_id, user.gym_id, input.member_id, String(input.name).trim(), await resolveTrainingLevel(query, user.gym_id, input.level), input.goal || null, input.starts_at || null]
    );

    await query(
      `DELETE FROM workout_exercises
       WHERE gym_id = $1 AND workout_day_id IN (SELECT id FROM workout_days WHERE gym_id = $1 AND plan_id = $2)`,
      [user.gym_id, input.plan_id]
    );
    await query('DELETE FROM workout_days WHERE gym_id = $1 AND plan_id = $2', [user.gym_id, input.plan_id]);

    for (const day of dayRows) {
      const weekday = day.weekday;
      const dayResult = await query(
        'INSERT INTO workout_days (gym_id, plan_id, weekday, title, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id, plan_id, weekday, title, notes',
        [user.gym_id, input.plan_id, weekday, String(day.title || `Dia ${weekday}`).trim(), day.notes || null]
      );
      for (const [index, exercise] of day.exercises.entries()) {
        const exerciseResult = await query(
          `INSERT INTO workout_exercises (gym_id, workout_day_id, exercise_id, order_index, sets, reps, rest_seconds, load_hint, notes)
           SELECT $1, $2, e.id, $4, $5, $6, $7, $8, $9
           FROM exercise_library e
           WHERE e.id = $3 AND e.gym_id = $1 AND e.is_active = true
           RETURNING id, workout_day_id, exercise_id`,
          [user.gym_id, dayResult.rows[0].id, exercise.exercise_id, index + 1, Number(exercise.sets || 3), exercise.reps || '10-12', Number(exercise.rest_seconds || 60), exercise.load_hint || null, exercise.notes || null]
        );
        if (!exerciseResult.rowCount) return send(res, 404, { error: 'exercicio_nao_encontrado' });
      }
    }
    await recordAudit(user, 'update', 'workout_plan', input.plan_id, { member_id: input.member_id, days: input.days.length });
    return send(res, 200, saved.rows[0]);
  }

  if (req.method === 'DELETE' && url.pathname === '/api/training/plans') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const result = await query(
      `UPDATE workout_plans SET status = 'inactive', updated_at = now()
       WHERE id = $1 AND gym_id = $2
       RETURNING id, status`,
      [input.plan_id, user.gym_id]
    );
    if (!result.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    await recordAudit(user, 'deactivate', 'workout_plan', input.plan_id, {});
    return send(res, 200, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/training/plans/day') {
    const input = await body(req);
    if (!input.plan_id || !input.title) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      'INSERT INTO workout_days (gym_id, plan_id, weekday, title, notes) SELECT $1, id, $3, $4, $5 FROM workout_plans WHERE id = $2 AND gym_id = $1 RETURNING id, plan_id, weekday, title, notes',
      [user.gym_id, input.plan_id, Number(input.weekday || 1), input.title, input.notes || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'POST' && url.pathname === '/api/training/plans/exercise') {
    const input = await body(req);
    if (!input.workout_day_id || !input.exercise_id) return send(res, 400, { error: 'dados_invalidos' });
    const result = await query(
      `INSERT INTO workout_exercises (gym_id, workout_day_id, exercise_id, order_index, sets, reps, rest_seconds, load_hint, notes)
       SELECT $1, wd.id, e.id, $4, $5, $6, $7, $8, $9
       FROM workout_days wd INNER JOIN exercise_library e ON e.id = $3 AND e.gym_id = $1
       WHERE wd.id = $2 AND wd.gym_id = $1
       RETURNING id, workout_day_id, exercise_id, order_index, sets, reps, rest_seconds, load_hint, notes`,
      [user.gym_id, input.workout_day_id, input.exercise_id, Number(input.order_index || 1), Number(input.sets || 3), input.reps || '10-12', Number(input.rest_seconds || 60), input.load_hint || null, input.notes || null]
    );
    if (!result.rowCount) return send(res, 404, { error: 'dia_ou_exercicio_nao_encontrado' });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/training/plans/detail') {
    const planId = url.searchParams.get('plan_id');
    if (!planId) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const plan = await query('SELECT id, member_id, name, level, goal, status, starts_at, current_date - starts_at AS age_days FROM workout_plans WHERE id = $1 AND gym_id = $2 LIMIT 1', [planId, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const [days, exercises] = await Promise.all([
      query('SELECT id, plan_id, weekday, title, notes FROM workout_days WHERE plan_id = $1 AND gym_id = $2 ORDER BY weekday, created_at', [planId, user.gym_id]),
      planExercises(query, user.gym_id, planId)
    ]);
    return send(res, 200, { plan: plan.rows[0], days: days.rows, exercises });
  }

  if (req.method === 'POST' && url.pathname === '/api/training/plans/review') {
    const input = await body(req);
    if (!input.plan_id) return send(res, 400, { error: 'plan_id_obrigatorio' });
    const plan = await query('SELECT id, member_id, level, current_date - starts_at AS age_days FROM workout_plans WHERE id = $1 AND gym_id = $2 LIMIT 1', [input.plan_id, user.gym_id]);
    if (!plan.rowCount) return send(res, 404, { error: 'ficha_nao_encontrada' });
    const exercises = await planExercises(query, user.gym_id, input.plan_id);
    const review = buildTrainingReview({ planAgeDays: Number(plan.rows[0].age_days || 0), level: plan.rows[0].level, exercises });
    const saved = await query('INSERT INTO workout_ai_reviews (gym_id, member_id, plan_id, plan_age_days, recommendation, suggestions) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, recommendation, suggestions, created_at', [user.gym_id, plan.rows[0].member_id, input.plan_id, Number(plan.rows[0].age_days || 0), review.recommendation, JSON.stringify(review.suggestions)]);
    await query('UPDATE workout_plans SET reviewed_at = now() WHERE id = $1 AND gym_id = $2', [input.plan_id, user.gym_id]);
    return send(res, 201, saved.rows[0]);
  }

  return false;
}

module.exports = { handleTrainingPlansRoutes };
