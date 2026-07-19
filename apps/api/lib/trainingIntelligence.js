const MODEL_VERSION = 'hybrid-v1.0';

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  const valid = values.map(number).filter((value) => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }

function metricDelta(assessments, field) {
  const current = number(assessments?.[0]?.[field]);
  const previous = number(assessments?.[1]?.[field]);
  return current === null || previous === null ? null : current - previous;
}

function goalKind(profile, goals) {
  const text = normalize([profile?.goal, ...(goals || []).filter((goal) => goal.status === 'active').map((goal) => `${goal.goal_type} ${goal.notes || ''}`)].join(' '));
  if (/emagrec|perder|gordura|defini|peso/.test(text)) return 'fat_loss';
  if (/hipertrof|massa|muscul/.test(text)) return 'hypertrophy';
  if (/forca|carga|strength/.test(text)) return 'strength';
  if (/condicion|cardio|resisten/.test(text)) return 'conditioning';
  if (/mobil|flexib|postur/.test(text)) return 'mobility';
  return 'general';
}

const GROUP_ALIASES = [
  ['peito', /peito|peitoral/], ['costas', /costa|dorsal|lombar/], ['pernas', /perna|quadricep|posterior|panturrilha/],
  ['gluteos', /glute/], ['ombros', /ombro|deltoid/], ['bracos', /biceps|triceps|braco|antebraco/], ['core', /abd|core|obliqu/]
];

function muscleGroups(item) {
  const text = normalize([item.muscle_group, item.muscle_group_primary, item.muscle_group_secondary, item.name].join(' '));
  return GROUP_ALIASES.filter(([, expression]) => expression.test(text)).map(([group]) => group);
}

function levelScore(exerciseLevel, profileLevel) {
  const order = { frango: 0, iniciante: 0, intermediario: 1, avancado: 2 };
  const exercise = order[normalize(exerciseLevel)] ?? 0;
  const profile = order[normalize(profileLevel)] ?? 0;
  return exercise <= profile ? 12 - ((profile - exercise) * 2) : -18;
}

function goalExerciseScore(kind, exercise) {
  const text = normalize([exercise.name, exercise.muscle_group, exercise.muscle_group_primary, exercise.instructions, exercise.equipment].join(' '));
  const compound = /agach|levantamento|terra|supino|remada|barra|afundo|desenvolvimento|leg press|puxada/.test(text);
  const cardio = /corrida|esteira|bicicleta|eliptico|corda|burpee|circuito/.test(text);
  const mobility = /mobil|along|flexib|rotacao/.test(text);
  if (kind === 'fat_loss' || kind === 'conditioning') return (compound ? 18 : 0) + (cardio ? 22 : 0);
  if (kind === 'strength') return compound ? 28 : 4;
  if (kind === 'hypertrophy') return compound ? 20 : 12;
  if (kind === 'mobility') return mobility ? 30 : -5;
  return compound ? 14 : 8;
}

function buildTrainingIntelligence(input = {}) {
  const assessments = input.assessments || [];
  const goals = input.goals || [];
  const profile = input.profile || {};
  const plan = input.plan || null;
  const exercises = input.exercises || [];
  const catalog = input.catalog || [];
  const logs = input.logs || [];
  const exerciseLogs = input.exerciseLogs || [];
  const feedbackStats = input.feedbackStats || [];
  const kind = goalKind(profile, goals);
  const plannedWeekly = Math.max(1, number(profile.training_days_per_week) || number(plan?.training_days_per_week) || 3);
  const completed28 = logs.filter((log) => normalize(log.status || 'completed') === 'completed').length;
  const expected28 = plannedWeekly * 4;
  const adherenceRate = clamp(completed28 / expected28 * 100);
  const avgEffort = average([...logs, ...exerciseLogs].map((log) => log.perceived_effort));
  const avgPain = average(exerciseLogs.map((log) => log.pain_level));
  const weight = metricDelta(assessments, 'weight_kg');
  const fat = metricDelta(assessments, 'body_fat_percent');
  const muscle = metricDelta(assessments, 'muscle_mass_kg');
  const waist = metricDelta(assessments, 'waist_cm');

  let progress = 50;
  if (kind === 'fat_loss') progress += (fat !== null ? clamp(-fat * 8, -20, 20) : 0) + (waist !== null ? clamp(-waist * 3, -15, 15) : 0) + (muscle !== null && muscle >= 0 ? 8 : 0);
  else if (kind === 'hypertrophy') progress += (muscle !== null ? clamp(muscle * 10, -20, 22) : 0) + (fat !== null && fat <= 1 ? 7 : fat !== null && fat > 2 ? -8 : 0);
  else if (kind === 'strength') progress += exerciseLogs.length >= 4 ? 10 : 0;
  else progress += (waist !== null ? clamp(-waist * 2, -12, 12) : 0) + (muscle !== null ? clamp(muscle * 6, -12, 12) : 0);
  const performanceScore = Math.round(clamp(progress * 0.55 + adherenceRate * 0.45));

  const safetyFlags = [];
  if (avgPain !== null && avgPain >= 4) safetyFlags.push('Dor média relevante nos registros; revisar execução e carga antes de progredir.');
  if (avgEffort !== null && avgEffort >= 9) safetyFlags.push('Esforço percebido muito alto; conferir recuperação, carga e descanso.');
  if (normalize(profile.restrictions)) safetyFlags.push(`Restrições cadastradas: ${profile.restrictions}`);

  const evidenceCount = [assessments.length >= 2, logs.length >= 4, Boolean(profile.goal), Boolean(plan), exerciseLogs.length >= 3].filter(Boolean).length;
  const confidenceScore = Math.round((evidenceCount / 5) * 100);
  const confidenceLabel = confidenceScore >= 80 ? 'alta' : confidenceScore >= 50 ? 'média' : 'baixa';
  let level = 'stable';
  if (confidenceScore < 40) level = 'insufficient_data';
  else if (safetyFlags.length) level = 'attention';
  else if (performanceScore >= 75) level = 'high';
  else if (performanceScore >= 58) level = 'progressing';
  else if (performanceScore < 42 || adherenceRate < 45) level = 'attention';

  const occupiedGroups = new Set(exercises.flatMap(muscleGroups));
  const expectedGroups = kind === 'hypertrophy' || kind === 'strength' ? ['peito', 'costas', 'pernas', 'gluteos', 'ombros', 'bracos', 'core'] : ['costas', 'pernas', 'gluteos', 'core'];
  const missingGroups = expectedGroups.filter((group) => !occupiedGroups.has(group));
  const currentIds = new Set(exercises.map((exercise) => String(exercise.exercise_id || exercise.id)));
  const restriction = normalize(profile.restrictions);
  const recommendations = catalog.filter((exercise) => exercise.is_active !== false && !currentIds.has(String(exercise.id))).map((exercise) => {
    const text = normalize([exercise.name, exercise.instructions, exercise.muscle_group, exercise.muscle_group_primary].join(' '));
    const groups = muscleGroups(exercise);
    const restrictionConflict = restriction && restriction.split(/[,;\n]/).some((term) => term.trim().length > 3 && text.includes(term.trim()));
    const fillsGap = groups.some((group) => missingGroups.includes(group));
    const learned = feedbackStats.find((row) => String(row.recommendation_key) === String(exercise.id));
    const observations = Number(learned?.total || 0); const positive = Number(learned?.positive || 0);
    const posteriorAcceptance = (positive + 2) / (observations + 4);
    const learningBoost = observations ? (posteriorAcceptance - 0.5) * 30 : 0;
    const score = goalExerciseScore(kind, exercise) + levelScore(exercise.level, profile.level || plan?.level) + (fillsGap ? 24 : 0) + learningBoost - (restrictionConflict ? 100 : 0);
    return { exercise_id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group_primary || exercise.muscle_group, action: 'add', score: Math.round(score), reason: fillsGap ? `Reforça ${groups.find((group) => missingGroups.includes(group))} e melhora o equilíbrio da ficha.` : `Compatível com a meta e o nível cadastrados.`, requires_review: Boolean(restrictionConflict), learning: { observations, acceptance_probability: Number(posteriorAcceptance.toFixed(2)) } };
  }).filter((item) => !item.requires_review && item.score > 8).sort((a, b) => b.score - a.score).slice(0, 5).map((item) => ({ ...item, confidence: confidenceLabel }));

  const strengths = [];
  if (adherenceRate >= 75) strengths.push('Boa consistência de treinos nas últimas quatro semanas.');
  if (performanceScore >= 65) strengths.push('Indicadores recentes estão alinhados à meta cadastrada.');
  if (missingGroups.length <= 1 && exercises.length) strengths.push('Ficha com cobertura muscular equilibrada para a meta.');
  const planRecommendations = [];
  if (adherenceRate < 60) planRecommendations.push('Priorizar aderência e rotina antes de aumentar volume ou intensidade.');
  if (missingGroups.length) planRecommendations.push(`Revisar cobertura de: ${missingGroups.join(', ')}.`);
  if (avgEffort !== null && avgEffort <= 5 && completed28 >= 6) planRecommendations.push('Avaliar progressão gradual de carga ou complexidade.');
  if (avgEffort !== null && avgEffort >= 9) planRecommendations.push('Reduzir intensidade pontualmente e conferir recuperação.');
  if (!planRecommendations.length) planRecommendations.push('Manter a estrutura e acompanhar a próxima medição e os registros de esforço.');

  const messages = {
    high: ['Desempenho alto', 'Seu ritmo está excelente. Continue com a ficha e registre os treinos para manter essa evolução.'],
    progressing: ['Boa evolução', 'Você está avançando. Mantenha a consistência e siga as orientações do seu personal.'],
    stable: ['Ritmo estável', 'Continue registrando seus treinos e medições para a análise ficar mais precisa.'],
    attention: ['Revisão recomendada', 'Alguns sinais pedem ajuste. Converse com seu personal antes de aumentar carga ou volume.'],
    insufficient_data: ['Análise em formação', 'Registre treinos e uma nova medição para receber orientações mais precisas.']
  };
  const [headline, studentMessage] = messages[level];
  return {
    model_version: MODEL_VERSION,
    generated_at: new Date().toISOString(),
    confidence: { score: confidenceScore, label: confidenceLabel, evidence: { assessments: assessments.length, completed_sessions_28d: completed28, exercise_logs: exerciseLogs.length } },
    performance: { level, score: performanceScore, headline, student_message: studentMessage, trainer_summary: `${headline}. Aderência de ${Math.round(adherenceRate)}%, confiança ${confidenceLabel} e meta classificada como ${kind}.` },
    adherence: { planned_per_week: plannedWeekly, completed_28d: completed28, expected_28d: expected28, rate: Math.round(adherenceRate), avg_effort: avgEffort === null ? null : Number(avgEffort.toFixed(1)), avg_pain: avgPain === null ? null : Number(avgPain.toFixed(1)) },
    goal_alignment: { goal: profile.goal || goals.find((goal) => goal.status === 'active')?.goal_type || 'geral', kind, score: Math.round(clamp(100 - missingGroups.length * 12)), covered_groups: [...occupiedGroups], missing_groups: missingGroups },
    plan_review: { status: safetyFlags.length ? 'professional_review' : plan ? 'reviewed' : 'no_active_plan', strengths, risks: safetyFlags, recommendations: planRecommendations },
    exercise_recommendations: recommendations,
    safety: { requires_professional_review: safetyFlags.length > 0, flags: safetyFlags, notice: 'Sugestões de apoio ao personal. Não substituem avaliação profissional ou orientação médica.' }
  };
}

async function loadTrainingIntelligence(query, gymId, memberId, seed = {}) {
  const [member, profile, plan, assessments, goals, catalog, logs, exerciseLogs, feedbackStats] = await Promise.all([
    query('SELECT id, name, objective, allergies FROM members WHERE gym_id = $1 AND id = $2 LIMIT 1', [gymId, memberId]),
    query('SELECT * FROM member_training_profiles WHERE gym_id = $1 AND member_id = $2 LIMIT 1', [gymId, memberId]),
    query("SELECT * FROM workout_plans WHERE gym_id = $1 AND member_id = $2 AND status = 'active' ORDER BY starts_at DESC, created_at DESC LIMIT 1", [gymId, memberId]),
    seed.assessments ? Promise.resolve({ rows: seed.assessments }) : query('SELECT * FROM member_assessments WHERE gym_id = $1 AND member_id = $2 ORDER BY assessment_date DESC, created_at DESC LIMIT 20', [gymId, memberId]),
    seed.goals ? Promise.resolve({ rows: seed.goals }) : query('SELECT * FROM member_goals WHERE gym_id = $1 AND member_id = $2 ORDER BY created_at DESC LIMIT 20', [gymId, memberId]),
    query('SELECT id, name, muscle_group, muscle_group_primary, muscle_group_secondary, equipment, level, instructions, is_active FROM exercise_library WHERE gym_id = $1 AND is_active = true', [gymId]),
    query(`SELECT status, perceived_effort, completed_at FROM workout_day_logs WHERE gym_id = $1 AND member_id = $2 AND completed_at >= now() - interval '28 days'
           UNION ALL SELECT status, perceived_effort, completed_at FROM student_workout_day_logs WHERE gym_id = $1 AND member_id = $2 AND completed_at >= now() - interval '28 days'`, [gymId, memberId]),
    query(`SELECT wel.perceived_effort, wel.pain_level, wel.completed_at FROM workout_exercise_logs wel INNER JOIN workout_day_logs wdl ON wdl.id = wel.workout_day_log_id WHERE wel.gym_id = $1 AND wdl.member_id = $2 AND wel.completed_at >= now() - interval '84 days'`, [gymId, memberId]),
    query(`SELECT recommendation_key, count(*)::int AS total, count(*) FILTER (WHERE decision IN ('accepted','applied'))::int AS positive FROM ai_recommendation_feedback WHERE gym_id = $1 GROUP BY recommendation_key`, [gymId])
  ]);
  if (!member.rowCount) return null;
  const activePlan = plan.rows[0] || null;
  const exercises = activePlan ? await query(`SELECT we.*, e.name, e.id AS exercise_id, e.muscle_group, e.muscle_group_primary, e.muscle_group_secondary FROM workout_exercises we INNER JOIN workout_days wd ON wd.id = we.workout_day_id INNER JOIN exercise_library e ON e.id = we.exercise_id WHERE we.gym_id = $1 AND wd.plan_id = $2 ORDER BY wd.weekday, we.order_index`, [gymId, activePlan.id]) : { rows: [] };
  const effectiveProfile = { goal: member.rows[0].objective, restrictions: member.rows[0].allergies, ...(profile.rows[0] || {}) };
  return buildTrainingIntelligence({ member: member.rows[0], profile: effectiveProfile, plan: activePlan, assessments: assessments.rows, goals: goals.rows, catalog: catalog.rows, exercises: exercises.rows, logs: logs.rows, exerciseLogs: exerciseLogs.rows, feedbackStats: feedbackStats.rows });
}

module.exports = { MODEL_VERSION, buildTrainingIntelligence, loadTrainingIntelligence };
