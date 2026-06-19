const { recordAudit } = require('../lib/audit');

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
}

function delta(current, previous, field) {
  const a = current?.[field];
  const b = previous?.[field];
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return Number(a) - Number(b);
}

async function handleAssessmentRoutes(req, res, user, url, helpers) {
  const { send, body, query } = helpers;

  if (req.method === 'GET' && url.pathname === '/api/assessments') {
    const memberId = url.searchParams.get('member_id');
    const result = await query(
      `SELECT a.*, m.name AS member_name
       FROM member_assessments a INNER JOIN members m ON m.id = a.member_id
       WHERE a.gym_id = $1 AND ($2::uuid IS NULL OR a.member_id = $2::uuid)
       ORDER BY a.assessment_date DESC, a.created_at DESC LIMIT 200`,
      [user.gym_id, memberId || null]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/assessments') {
    const input = await body(req);
    if (!input.member_id) return send(res, 400, { error: 'member_id_obrigatorio' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });

    const result = await query(
      `INSERT INTO member_assessments (
        gym_id, member_id, assessment_date, weight_kg, height_cm, body_fat_percent, muscle_mass_kg,
        waist_cm, chest_cm, hip_cm, left_arm_cm, right_arm_cm, left_thigh_cm, right_thigh_cm,
        resting_heart_rate, photo_url, notes, created_by
      ) VALUES ($1,$2,COALESCE($3::date,current_date),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        user.gym_id,
        input.member_id,
        input.assessment_date || null,
        numberOrNull(input.weight_kg),
        numberOrNull(input.height_cm),
        numberOrNull(input.body_fat_percent),
        numberOrNull(input.muscle_mass_kg),
        numberOrNull(input.waist_cm),
        numberOrNull(input.chest_cm),
        numberOrNull(input.hip_cm),
        numberOrNull(input.left_arm_cm),
        numberOrNull(input.right_arm_cm),
        numberOrNull(input.left_thigh_cm),
        numberOrNull(input.right_thigh_cm),
        intOrNull(input.resting_heart_rate),
        input.photo_url || null,
        input.notes || null,
        user.sub
      ]
    );
    await recordAudit(user, 'create', 'member_assessment', result.rows[0].id, { member_id: input.member_id });
    return send(res, 201, result.rows[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/assessments/summary') {
    const memberId = url.searchParams.get('member_id');
    if (!memberId) return send(res, 400, { error: 'member_id_obrigatorio' });
    const result = await query(
      `SELECT * FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 2`,
      [user.gym_id, memberId]
    );
    const current = result.rows[0] || null;
    const previous = result.rows[1] || null;
    return send(res, 200, {
      current,
      previous,
      delta: current && previous ? {
        weight_kg: delta(current, previous, 'weight_kg'),
        body_fat_percent: delta(current, previous, 'body_fat_percent'),
        muscle_mass_kg: delta(current, previous, 'muscle_mass_kg'),
        waist_cm: delta(current, previous, 'waist_cm')
      } : null
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/goals') {
    const memberId = url.searchParams.get('member_id');
    const result = await query(
      `SELECT g.*, m.name AS member_name FROM member_goals g INNER JOIN members m ON m.id = g.member_id
       WHERE g.gym_id = $1 AND ($2::uuid IS NULL OR g.member_id = $2::uuid)
       ORDER BY g.status, g.target_date NULLS LAST, g.created_at DESC LIMIT 200`,
      [user.gym_id, memberId || null]
    );
    return send(res, 200, { data: result.rows });
  }

  if (req.method === 'POST' && url.pathname === '/api/goals') {
    const input = await body(req);
    if (!input.member_id || !input.goal_type) return send(res, 400, { error: 'dados_invalidos' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2', [input.member_id, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const result = await query(
      `INSERT INTO member_goals (gym_id, member_id, goal_type, target_value, target_date, notes)
       VALUES ($1, $2, $3, $4, $5::date, $6)
       RETURNING *`,
      [user.gym_id, input.member_id, input.goal_type, numberOrNull(input.target_value), input.target_date || null, input.notes || null]
    );
    await recordAudit(user, 'create', 'member_goal', result.rows[0].id, { member_id: input.member_id, goal_type: input.goal_type });
    return send(res, 201, result.rows[0]);
  }

  return false;
}

module.exports = { handleAssessmentRoutes };
