const { recordAudit } = require('../lib/audit');
const { hasModulePermission } = require('../lib/accessControl');

function isManager(user) {
  return hasModulePermission(user, 'members');
}

function canCoach(user) {
  return hasModulePermission(user, 'training');
}

function isStudent(user) {
  return user && user.role === 'student' && user.member_id;
}

function integerInRange(value, min, max, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

async function memberWorkspace(res, user, url, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const memberId = url.searchParams.get('member_id');
  if (!memberId) return helpers.send(res, 400, { error: 'member_id_obrigatorio' });

  const [member, memberships, payments, checkins, assessments, goals, profile, plans, staff] = await Promise.all([
    helpers.query(
      `SELECT m.id, m.name, m.email, m.phone, m.status, m.photo_url, m.birth_date,
              m.document, m.address, m.address_details, m.emergency_contact,
              m.emergency_name, m.emergency_phone, m.allergies, m.medical_notes,
              m.nutrition_notes, m.objective, m.notes, m.assigned_staff_id,
              u.name AS assigned_staff_name, m.created_at, m.updated_at
       FROM members m
       LEFT JOIN users u ON u.id = m.assigned_staff_id AND u.gym_id = m.gym_id
       WHERE m.id = $1 AND m.gym_id = $2 LIMIT 1`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT ms.id, ms.status, ms.starts_at, ms.ends_at, ms.created_at,
              p.id AS plan_id, p.name AS plan_name, p.price_cents, p.duration_days
       FROM memberships ms INNER JOIN plans p ON p.id = ms.plan_id
       WHERE ms.member_id = $1 AND ms.gym_id = $2
       ORDER BY ms.starts_at DESC LIMIT 20`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT id, amount_cents, original_amount_cents, discount_cents, fee_cents,
              status, due_date, paid_at, method, notes, created_at
       FROM payments WHERE member_id = $1 AND gym_id = $2
       ORDER BY due_date DESC LIMIT 50`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT c.id, c.checked_at, c.source, ad.name AS device_name,
              d.allowed, d.status AS access_status, d.message
       FROM checkins c
       LEFT JOIN access_decisions d ON d.checkin_id = c.id
       LEFT JOIN access_devices ad ON ad.id = d.device_id
       WHERE c.member_id = $1 AND c.gym_id = $2
       ORDER BY c.checked_at DESC LIMIT 50`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT * FROM member_assessments
       WHERE member_id = $1 AND gym_id = $2
       ORDER BY assessment_date DESC, created_at DESC LIMIT 30`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT * FROM member_goals
       WHERE member_id = $1 AND gym_id = $2
       ORDER BY status, target_date NULLS LAST, created_at DESC LIMIT 30`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT id, level, goal, restrictions, training_days_per_week, updated_at
       FROM member_training_profiles
       WHERE member_id = $1 AND gym_id = $2 LIMIT 1`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT wp.id, wp.name, wp.level, wp.goal, wp.status, wp.starts_at,
              wp.review_due_at, wp.training_days_per_week, wp.general_notes,
              wp.reviewed_at, wp.created_at, wp.updated_at,
              current_date - wp.starts_at AS age_days,
              count(DISTINCT wd.id)::integer AS workout_days,
              count(we.id)::integer AS exercise_count
       FROM workout_plans wp
       LEFT JOIN workout_days wd ON wd.plan_id = wp.id AND wd.gym_id = wp.gym_id
       LEFT JOIN workout_exercises we ON we.workout_day_id = wd.id AND we.gym_id = wp.gym_id
       WHERE wp.member_id = $1 AND wp.gym_id = $2
       GROUP BY wp.id ORDER BY wp.created_at DESC LIMIT 30`,
      [memberId, user.gym_id]
    ),
    helpers.query(
      `SELECT id, name, email, role FROM users
       WHERE gym_id = $1 AND role IN ('owner','admin','staff') AND is_active = true
       ORDER BY name`,
      [user.gym_id]
    )
  ]);

  if (!member.rowCount) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });
  return helpers.send(res, 200, {
    member: member.rows[0],
    memberships: memberships.rows,
    payments: payments.rows,
    checkins: checkins.rows,
    assessments: assessments.rows,
    goals: goals.rows,
    training_profile: profile.rows[0] || null,
    workout_plans: plans.rows,
    available_staff: staff.rows
  });
}

async function updateMemberWorkspace(req, res, user, helpers) {
  if (!isManager(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.member_id || !input.name) return helpers.send(res, 400, { error: 'dados_invalidos' });

  if (input.assigned_staff_id) {
    const staff = await helpers.query(
      `SELECT id FROM users WHERE id = $1 AND gym_id = $2
       AND role IN ('owner','admin','staff') AND is_active = true`,
      [input.assigned_staff_id, user.gym_id]
    );
    if (!staff.rowCount) return helpers.send(res, 404, { error: 'professor_nao_encontrado' });
  }

  const result = await helpers.query(
    `UPDATE members SET
       name = $3, email = $4, phone = $5, photo_url = $6, birth_date = $7,
       document = $8, address = $9, address_details = $10::jsonb,
       emergency_contact = $11, emergency_name = $12, emergency_phone = $13,
       allergies = $14, medical_notes = $15, nutrition_notes = $16,
       objective = $17, notes = $18, assigned_staff_id = $19, status = $20,
       updated_at = now()
     WHERE id = $1 AND gym_id = $2
     RETURNING id, name, email, phone, status, assigned_staff_id, updated_at`,
    [
      input.member_id,
      user.gym_id,
      String(input.name).trim(),
      input.email || null,
      input.phone || null,
      input.photo_url || null,
      input.birth_date || null,
      input.document || null,
      input.address || null,
      JSON.stringify(input.address_details || {}),
      input.emergency_contact || null,
      input.emergency_name || null,
      input.emergency_phone || null,
      input.allergies || null,
      input.medical_notes || null,
      input.nutrition_notes || null,
      input.objective || null,
      input.notes || null,
      input.assigned_staff_id || null,
      input.status === 'inactive' ? 'inactive' : 'active'
    ]
  );
  if (!result.rowCount) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });
  await recordAudit(user, 'update', 'member_workspace', input.member_id, { assigned_staff_id: input.assigned_staff_id || null });
  return helpers.send(res, 200, result.rows[0]);
}

async function updateTrainingProfile(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.member_id) return helpers.send(res, 400, { error: 'member_id_obrigatorio' });
  const member = await helpers.query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
  if (!member.rowCount) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });

  const result = await helpers.query(
    `INSERT INTO member_training_profiles
       (gym_id, member_id, level, goal, restrictions, training_days_per_week)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (gym_id, member_id) DO UPDATE SET
       level = EXCLUDED.level,
       goal = EXCLUDED.goal,
       restrictions = EXCLUDED.restrictions,
       training_days_per_week = EXCLUDED.training_days_per_week,
       updated_at = now()
     RETURNING id, member_id, level, goal, restrictions, training_days_per_week, updated_at`,
    [
      user.gym_id,
      input.member_id,
      input.level || 'iniciante',
      input.goal || null,
      input.restrictions || null,
      integerInRange(input.training_days_per_week, 1, 7, 3)
    ]
  );
  await recordAudit(user, 'upsert', 'training_profile', result.rows[0].id, { member_id: input.member_id });
  return helpers.send(res, 200, result.rows[0]);
}

async function saveWorkoutPlan(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.member_id || !input.name) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const member = await helpers.query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
  if (!member.rowCount) return helpers.send(res, 404, { error: 'aluno_nao_encontrado' });

  let result;
  if (input.plan_id) {
    result = await helpers.query(
      `UPDATE workout_plans SET
         name = $3, level = $4, goal = $5, status = $6, starts_at = $7,
         review_due_at = $8, training_days_per_week = $9,
         general_notes = $10, updated_at = now()
       WHERE id = $1 AND gym_id = $2 AND member_id = $11
       RETURNING *`,
      [
        input.plan_id,
        user.gym_id,
        String(input.name).trim(),
        input.level || 'iniciante',
        input.goal || null,
        ['active', 'inactive', 'archived'].includes(input.status) ? input.status : 'active',
        input.starts_at || new Date().toISOString().slice(0, 10),
        input.review_due_at || null,
        integerInRange(input.training_days_per_week, 1, 7, null),
        input.general_notes || null,
        input.member_id
      ]
    );
  } else {
    if (input.status !== 'inactive') {
      await helpers.query(
        `UPDATE workout_plans SET status = 'inactive', updated_at = now()
         WHERE gym_id = $1 AND member_id = $2 AND status = 'active'`,
        [user.gym_id, input.member_id]
      );
    }
    result = await helpers.query(
      `INSERT INTO workout_plans
         (gym_id, member_id, name, level, goal, status, starts_at,
          review_due_at, training_days_per_week, general_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        user.gym_id,
        input.member_id,
        String(input.name).trim(),
        input.level || 'iniciante',
        input.goal || null,
        input.status === 'inactive' ? 'inactive' : 'active',
        input.starts_at || new Date().toISOString().slice(0, 10),
        input.review_due_at || null,
        integerInRange(input.training_days_per_week, 1, 7, null),
        input.general_notes || null
      ]
    );
  }
  if (!result.rowCount) return helpers.send(res, 404, { error: 'ficha_nao_encontrada' });
  await recordAudit(user, input.plan_id ? 'update' : 'create', 'workout_plan', result.rows[0].id, { member_id: input.member_id });
  return helpers.send(res, input.plan_id ? 200 : 201, result.rows[0]);
}

async function saveWorkoutDay(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.plan_id || !input.title) return helpers.send(res, 400, { error: 'dados_invalidos' });
  const weekday = integerInRange(input.weekday, 1, 7, 1);
  let result;
  if (input.workout_day_id) {
    result = await helpers.query(
      `UPDATE workout_days wd SET weekday = $3, title = $4, notes = $5
       FROM workout_plans wp
       WHERE wd.id = $1 AND wd.gym_id = $2 AND wp.id = wd.plan_id
         AND wp.id = $6 AND wp.gym_id = $2
       RETURNING wd.id, wd.plan_id, wd.weekday, wd.title, wd.notes`,
      [input.workout_day_id, user.gym_id, weekday, String(input.title).trim(), input.notes || null, input.plan_id]
    );
  } else {
    result = await helpers.query(
      `INSERT INTO workout_days (gym_id, plan_id, weekday, title, notes)
       SELECT $1, id, $3, $4, $5 FROM workout_plans
       WHERE id = $2 AND gym_id = $1
       RETURNING id, plan_id, weekday, title, notes`,
      [user.gym_id, input.plan_id, weekday, String(input.title).trim(), input.notes || null]
    );
  }
  if (!result.rowCount) return helpers.send(res, 404, { error: 'dia_ou_ficha_nao_encontrado' });
  return helpers.send(res, input.workout_day_id ? 200 : 201, result.rows[0]);
}

async function saveWorkoutExercise(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  if (!input.workout_day_id || !input.exercise_id) return helpers.send(res, 400, { error: 'dados_invalidos' });

  const values = [
    integerInRange(input.order_index, 1, 999, 1),
    integerInRange(input.sets, 1, 20, 3),
    input.reps || '10-12',
    integerInRange(input.rest_seconds, 0, 1200, 60),
    input.load_hint || null,
    input.notes || null,
    input.suggested_load || null,
    input.cadence || null,
    input.training_method || null,
    input.progression_rule || null,
    input.substitute_exercise_id || null
  ];

  let result;
  if (input.workout_exercise_id) {
    result = await helpers.query(
      `UPDATE workout_exercises SET
         exercise_id = $3, order_index = $4, sets = $5, reps = $6,
         rest_seconds = $7, load_hint = $8, notes = $9,
         suggested_load = $10, cadence = $11, training_method = $12,
         progression_rule = $13, substitute_exercise_id = $14, updated_at = now()
       WHERE id = $1 AND gym_id = $2 AND workout_day_id = $15
       RETURNING *`,
      [input.workout_exercise_id, user.gym_id, input.exercise_id, ...values, input.workout_day_id]
    );
  } else {
    result = await helpers.query(
      `INSERT INTO workout_exercises
         (gym_id, workout_day_id, exercise_id, order_index, sets, reps,
          rest_seconds, load_hint, notes, suggested_load, cadence,
          training_method, progression_rule, substitute_exercise_id)
       SELECT $1, wd.id, e.id, $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
       FROM workout_days wd
       INNER JOIN exercise_library e ON e.id = $3 AND e.gym_id = $1
       WHERE wd.id = $2 AND wd.gym_id = $1
       RETURNING workout_exercises.*`,
      [user.gym_id, input.workout_day_id, input.exercise_id, ...values]
    );
  }
  if (!result.rowCount) return helpers.send(res, 404, { error: 'dia_ou_exercicio_nao_encontrado' });
  return helpers.send(res, input.workout_exercise_id ? 200 : 201, result.rows[0]);
}

async function deleteWorkoutItem(req, res, user, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const input = await helpers.body(req);
  let result;
  if (input.workout_exercise_id) {
    result = await helpers.query(
      'DELETE FROM workout_exercises WHERE id = $1 AND gym_id = $2 RETURNING id',
      [input.workout_exercise_id, user.gym_id]
    );
  } else if (input.workout_day_id) {
    result = await helpers.query(
      'DELETE FROM workout_days WHERE id = $1 AND gym_id = $2 RETURNING id',
      [input.workout_day_id, user.gym_id]
    );
  } else {
    return helpers.send(res, 400, { error: 'item_obrigatorio' });
  }
  if (!result.rowCount) return helpers.send(res, 404, { error: 'item_nao_encontrado' });
  return helpers.send(res, 200, { deleted: result.rows[0].id });
}

async function workoutDetail(res, user, url, helpers) {
  if (!canCoach(user)) return helpers.send(res, 403, { error: 'sem_permissao' });
  const planId = url.searchParams.get('plan_id');
  if (!planId) return helpers.send(res, 400, { error: 'plan_id_obrigatorio' });
  const plan = await helpers.query(
    `SELECT wp.*, m.name AS member_name
     FROM workout_plans wp INNER JOIN members m ON m.id = wp.member_id
     WHERE wp.id = $1 AND wp.gym_id = $2 LIMIT 1`,
    [planId, user.gym_id]
  );
  if (!plan.rowCount) return helpers.send(res, 404, { error: 'ficha_nao_encontrada' });
  const [days, exercises, library] = await Promise.all([
    helpers.query('SELECT * FROM workout_days WHERE plan_id = $1 AND gym_id = $2 ORDER BY weekday, created_at', [planId, user.gym_id]),
    helpers.query(
      `SELECT we.*, e.name AS exercise_name, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary, e.video_url, e.image_url, e.instructions,
              sub.name AS substitute_exercise_name
       FROM workout_exercises we
       INNER JOIN workout_days wd ON wd.id = we.workout_day_id
       INNER JOIN exercise_library e ON e.id = we.exercise_id
       LEFT JOIN exercise_library sub ON sub.id = we.substitute_exercise_id
       WHERE wd.plan_id = $1 AND we.gym_id = $2
       ORDER BY wd.weekday, we.order_index`,
      [planId, user.gym_id]
    ),
    helpers.query(
      `SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, level, instructions, video_url, image_url
       FROM exercise_library WHERE gym_id = $1 AND is_active = true
       ORDER BY muscle_group, name`,
      [user.gym_id]
    )
  ]);
  return helpers.send(res, 200, { plan: plan.rows[0], days: days.rows, exercises: exercises.rows, library: library.rows });
}

async function studentExerciseLog(req, res, user, helpers) {
  if (!isStudent(user)) return helpers.send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const input = await helpers.body(req);
  if (!input.workout_exercise_id) return helpers.send(res, 400, { error: 'workout_exercise_id_obrigatorio' });
  const valid = await helpers.query(
    `SELECT we.id, wd.id AS workout_day_id, wp.id AS plan_id
     FROM workout_exercises we
     INNER JOIN workout_days wd ON wd.id = we.workout_day_id
     INNER JOIN workout_plans wp ON wp.id = wd.plan_id
     WHERE we.id = $1 AND we.gym_id = $2 AND wp.member_id = $3 AND wp.status = 'active'
     LIMIT 1`,
    [input.workout_exercise_id, user.gym_id, user.member_id]
  );
  if (!valid.rowCount) return helpers.send(res, 404, { error: 'exercicio_nao_encontrado' });

  let dayLogId = input.workout_day_log_id || null;
  if (!dayLogId) {
    const dayLog = await helpers.query(
      `INSERT INTO workout_day_logs
         (gym_id, member_id, plan_id, workout_day_id, status, feedback, perceived_effort)
       VALUES ($1,$2,$3,$4,'in_progress',$5,$6)
       RETURNING id`,
      [
        user.gym_id,
        user.member_id,
        valid.rows[0].plan_id,
        valid.rows[0].workout_day_id,
        input.feedback || null,
        integerInRange(input.perceived_effort, 1, 10, null)
      ]
    );
    dayLogId = dayLog.rows[0].id;
  }

  const result = await helpers.query(
    `INSERT INTO workout_exercise_logs
       (gym_id, workout_day_log_id, workout_exercise_id, completed_sets,
        completed_reps, load_used, notes, perceived_effort, pain_level)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      user.gym_id,
      dayLogId,
      input.workout_exercise_id,
      integerInRange(input.completed_sets, 0, 30, null),
      input.completed_reps || null,
      input.load_used || null,
      input.notes || null,
      integerInRange(input.perceived_effort, 1, 10, null),
      integerInRange(input.pain_level, 0, 10, null)
    ]
  );
  return helpers.send(res, 201, { day_log_id: dayLogId, exercise_log: result.rows[0] });
}

async function studentExerciseHistory(res, user, url, helpers) {
  if (!isStudent(user)) return helpers.send(res, 403, { error: 'acesso_exclusivo_aluno' });
  const exerciseId = url.searchParams.get('workout_exercise_id');
  const result = await helpers.query(
    `SELECT wel.id, wel.workout_exercise_id, wel.completed_sets, wel.completed_reps,
            wel.load_used, wel.notes, wel.perceived_effort, wel.pain_level,
            wel.completed_at, e.name AS exercise_name
     FROM workout_exercise_logs wel
     INNER JOIN workout_day_logs wdl ON wdl.id = wel.workout_day_log_id
     INNER JOIN workout_exercises we ON we.id = wel.workout_exercise_id
     INNER JOIN exercise_library e ON e.id = we.exercise_id
     WHERE wel.gym_id = $1 AND wdl.member_id = $2
       AND ($3::uuid IS NULL OR wel.workout_exercise_id = $3::uuid)
     ORDER BY wel.completed_at DESC LIMIT 100`,
    [user.gym_id, user.member_id, exerciseId || null]
  );
  return helpers.send(res, 200, { data: result.rows });
}

async function handleMemberWorkspaceRoutes(req, res, user, url, helpers) {
  if (!user) return false;
  if (req.method === 'GET' && url.pathname === '/api/members/workspace') return memberWorkspace(res, user, url, helpers);
  if (req.method === 'POST' && url.pathname === '/api/members/workspace/update') return updateMemberWorkspace(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/members/training-profile') return updateTrainingProfile(req, res, user, helpers);

  if (req.method === 'POST' && url.pathname === '/api/training/workspace/plan') return saveWorkoutPlan(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/training/workspace/day') return saveWorkoutDay(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/training/workspace/exercise') return saveWorkoutExercise(req, res, user, helpers);
  if (req.method === 'POST' && url.pathname === '/api/training/workspace/delete') return deleteWorkoutItem(req, res, user, helpers);
  if (req.method === 'GET' && url.pathname === '/api/training/workspace/detail') return workoutDetail(res, user, url, helpers);

  if (req.method === 'POST' && url.pathname === '/api/student/training/exercise-log') return studentExerciseLog(req, res, user, helpers);
  if (req.method === 'GET' && url.pathname === '/api/student/training/exercise-history') return studentExerciseHistory(res, user, url, helpers);
  return false;
}

module.exports = { handleMemberWorkspaceRoutes, integerInRange };
