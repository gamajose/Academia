const crypto = require('crypto');
const { stableHash } = require('./trainingReviewSchema');

function cleanText(value, max = 1000) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[removido]')
    .replace(/(?:\+?55\s*)?(?:(?:\(\s*\d{2}\s*\)|\d{2})\s*)?\d{4,5}[-.\s]?\d{4}/g, '[removido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[removido]')
    .replace(/https?:\/\/\S+/gi, '[link removido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function anonymizedMemberId(gymId, memberId) {
  return crypto.createHash('sha256').update(`${gymId}:${memberId}`).digest('hex').slice(0, 20);
}

function assessmentRow(row) {
  return {
    assessment_date: row.assessment_date,
    weight_kg: finite(row.weight_kg),
    height_cm: finite(row.height_cm),
    body_fat_percent: finite(row.body_fat_percent),
    muscle_mass_kg: finite(row.muscle_mass_kg),
    waist_cm: finite(row.waist_cm),
    chest_cm: finite(row.chest_cm),
    hip_cm: finite(row.hip_cm),
    left_arm_cm: finite(row.left_arm_cm),
    right_arm_cm: finite(row.right_arm_cm),
    left_thigh_cm: finite(row.left_thigh_cm),
    right_thigh_cm: finite(row.right_thigh_cm)
  };
}

async function loadTrainingReviewSnapshot(query, gymId, planId) {
  const planResult = await query(
    `SELECT wp.id, wp.member_id, wp.level, wp.goal, wp.status, wp.starts_at,
            wp.training_days_per_week, wp.general_notes,
            current_date - wp.starts_at AS age_days,
            mtp.goal AS profile_goal, mtp.level AS profile_level,
            mtp.restrictions, mtp.training_days_per_week AS profile_days,
            m.objective, m.allergies, m.medical_notes
     FROM workout_plans wp
     INNER JOIN members m ON m.id = wp.member_id AND m.gym_id = wp.gym_id
     LEFT JOIN member_training_profiles mtp ON mtp.gym_id = wp.gym_id AND mtp.member_id = wp.member_id
     WHERE wp.id = $1 AND wp.gym_id = $2
     LIMIT 1`,
    [planId, gymId]
  );
  if (!planResult.rowCount) return null;
  const plan = planResult.rows[0];
  const [days, exercises, logs, exerciseLogs, assessments, goals, catalog, previous] = await Promise.all([
    query(
      'SELECT id, weekday, title, notes FROM workout_days WHERE gym_id = $1 AND plan_id = $2 ORDER BY weekday, created_at',
      [gymId, planId]
    ),
    query(
      `SELECT we.id AS workout_exercise_id, we.exercise_id, we.sets, we.reps,
              we.rest_seconds, COALESCE(we.suggested_load, we.load_hint) AS load_hint,
              we.notes, we.cadence, we.training_method, we.progression_rule,
              wd.weekday, wd.title AS day_title,
              e.name AS exercise_name, e.muscle_group,
              e.muscle_group_primary, e.muscle_group_secondary, e.equipment, e.level
       FROM workout_exercises we
       INNER JOIN workout_days wd ON wd.id = we.workout_day_id AND wd.gym_id = we.gym_id
       INNER JOIN exercise_library e ON e.id = we.exercise_id AND e.gym_id = we.gym_id
       WHERE we.gym_id = $1 AND wd.plan_id = $2
       ORDER BY wd.weekday, we.order_index`,
      [gymId, planId]
    ),
    query(
      `SELECT status, feedback, perceived_effort, completed_at
       FROM workout_day_logs
       WHERE gym_id = $1 AND member_id = $2 AND plan_id = $3
       ORDER BY completed_at DESC
       LIMIT 30`,
      [gymId, plan.member_id, planId]
    ),
    query(
      `SELECT wel.workout_exercise_id, wel.completed_sets, wel.completed_reps,
              wel.load_used, wel.perceived_effort, wel.pain_level, wel.completed_at
       FROM workout_exercise_logs wel
       INNER JOIN workout_day_logs wdl ON wdl.id = wel.workout_day_log_id
       WHERE wel.gym_id = $1 AND wdl.gym_id = $1
         AND wdl.member_id = $2 AND wdl.plan_id = $3
       ORDER BY wel.completed_at DESC
       LIMIT 120`,
      [gymId, plan.member_id, planId]
    ),
    query(
      `SELECT assessment_date, weight_kg, height_cm, body_fat_percent, muscle_mass_kg,
              waist_cm, chest_cm, hip_cm, left_arm_cm, right_arm_cm,
              left_thigh_cm, right_thigh_cm
       FROM member_assessments
       WHERE gym_id = $1 AND member_id = $2
       ORDER BY assessment_date DESC, created_at DESC
       LIMIT 4`,
      [gymId, plan.member_id]
    ),
    query(
      `SELECT goal_type, target_value, target_date, status, notes
       FROM member_goals
       WHERE gym_id = $1 AND member_id = $2 AND status = 'active'
       ORDER BY target_date NULLS LAST, created_at DESC
       LIMIT 10`,
      [gymId, plan.member_id]
    ),
    query(
      `SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary,
              equipment, level, instructions
       FROM exercise_library
       WHERE gym_id = $1 AND is_active = true
       ORDER BY name
       LIMIT 800`,
      [gymId]
    ),
    query(
      `SELECT source, status, confidence, requires_human_review, recommendation AS summary,
              signals, suggestions, created_at
       FROM workout_ai_reviews
       WHERE gym_id = $1 AND plan_id = $2
       ORDER BY created_at DESC
       LIMIT 3`,
      [gymId, planId]
    )
  ]);

  const completed = logs.rows.filter((item) => item.status === 'completed');
  const firstLogAt = logs.rows.at(-1)?.completed_at || null;
  const windowDays = firstLogAt
    ? Math.max(1, Math.ceil((Date.now() - new Date(firstLogAt).getTime()) / 86400000))
    : Math.max(1, Math.min(28, Number(plan.age_days || 1)));
  const plannedDays = Math.max(1, Math.min(7, Number(plan.training_days_per_week || plan.profile_days || days.rowCount || 3)));
  const expectedSessions = Math.max(1, Math.round(plannedDays * Math.min(4, windowDays / 7)));
  const adherenceRate = Math.min(1, completed.length / expectedSessions);

  const snapshot = {
    subject_id: anonymizedMemberId(gymId, plan.member_id),
    objective: cleanText(plan.profile_goal || plan.goal || plan.objective, 500) || null,
    level: cleanText(plan.profile_level || plan.level, 80) || 'não informado',
    restrictions: [plan.restrictions, plan.allergies, plan.medical_notes]
      .map((value) => cleanText(value, 700))
      .filter(Boolean),
    planned_days_per_week: plannedDays,
    plan: {
      id: plan.id,
      age_days: Number(plan.age_days || 0),
      status: plan.status,
      notes: cleanText(plan.general_notes, 700) || null,
      days: days.rows.map((item) => ({
        weekday: Number(item.weekday),
        title: cleanText(item.title, 100),
        notes: cleanText(item.notes, 300) || null
      })),
      exercises: exercises.rows.map((item) => ({
        exercise_id: item.exercise_id,
        name: cleanText(item.exercise_name, 160),
        weekday: Number(item.weekday),
        day_title: cleanText(item.day_title, 100),
        muscle_group_primary: cleanText(item.muscle_group_primary || item.muscle_group, 120) || null,
        muscle_group_secondary: cleanText(item.muscle_group_secondary, 120) || null,
        sets: finite(item.sets),
        reps: cleanText(item.reps, 40) || null,
        rest_seconds: finite(item.rest_seconds),
        load_hint: cleanText(item.load_hint, 120) || null,
        notes: cleanText(item.notes, 300) || null,
        cadence: cleanText(item.cadence, 80) || null,
        training_method: cleanText(item.training_method, 100) || null,
        progression_rule: cleanText(item.progression_rule, 200) || null
      }))
    },
    execution_summary: {
      considered_sessions: logs.rowCount,
      completed_sessions: completed.length,
      expected_sessions: expectedSessions,
      adherence_rate: Number(adherenceRate.toFixed(3)),
      first_considered_at: firstLogAt,
      last_considered_at: logs.rows[0]?.completed_at || null
    },
    executions: logs.rows.map((item) => ({
      status: item.status,
      feedback: cleanText(item.feedback, 500) || null,
      perceived_effort: finite(item.perceived_effort),
      completed_at: item.completed_at
    })),
    exercise_executions: exerciseLogs.rows.map((item) => ({
      workout_exercise_id: item.workout_exercise_id,
      completed_sets: finite(item.completed_sets),
      completed_reps: cleanText(item.completed_reps, 40) || null,
      load_used: cleanText(item.load_used, 80) || null,
      perceived_effort: finite(item.perceived_effort),
      pain_level: finite(item.pain_level),
      completed_at: item.completed_at
    })),
    assessments: assessments.rows.map(assessmentRow),
    active_goals: goals.rows.map((item) => ({
      goal_type: cleanText(item.goal_type, 120),
      target_value: finite(item.target_value),
      target_date: item.target_date,
      notes: cleanText(item.notes, 300) || null
    })),
    previous_reviews: previous.rows.map((item) => ({
      source: item.source,
      status: item.status,
      confidence: finite(item.confidence),
      requires_human_review: item.requires_human_review,
      summary: cleanText(item.summary, 400),
      created_at: item.created_at
    })),
    exercise_catalog: catalog.rows.map((item) => ({
      id: item.id,
      name: cleanText(item.name, 160),
      muscle_group_primary: cleanText(item.muscle_group_primary || item.muscle_group, 120) || null,
      muscle_group_secondary: cleanText(item.muscle_group_secondary, 120) || null,
      equipment: cleanText(item.equipment, 120) || null,
      level: cleanText(item.level, 80) || null,
      instructions: cleanText(item.instructions, 300) || null
    }))
  };
  return {
    memberId: plan.member_id,
    planId: plan.id,
    planAgeDays: Number(plan.age_days || 0),
    planExercises: exercises.rows,
    catalog: catalog.rows,
    snapshot,
    inputSnapshotHash: stableHash(snapshot)
  };
}

module.exports = {
  cleanText,
  anonymizedMemberId,
  loadTrainingReviewSnapshot
};
