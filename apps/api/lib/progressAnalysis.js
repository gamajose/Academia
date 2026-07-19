const ASSESSMENT_MEASUREMENT_FIELDS = [
  'weight_kg', 'height_cm', 'body_fat_percent', 'muscle_mass_kg',
  'waist_cm', 'chest_cm', 'hip_cm', 'biceps_cm', 'back_cm',
  'left_arm_cm', 'right_arm_cm', 'left_thigh_cm', 'right_thigh_cm',
  'resting_heart_rate'
];

function hasMeasurement(value) {
  return value !== undefined && value !== null && value !== '';
}

function carryForwardAssessments(assessments = []) {
  const rows = assessments.map((assessment) => ({ ...assessment }));
  const lastKnown = {};
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const assessment = rows[index];
    for (const field of ASSESSMENT_MEASUREMENT_FIELDS) {
      if (hasMeasurement(assessment[field])) lastKnown[field] = assessment[field];
      else if (hasMeasurement(lastKnown[field])) assessment[field] = lastKnown[field];
    }
  }
  return rows;
}

function numericDelta(current, previous, field) {
  if (!hasMeasurement(current?.[field]) || !hasMeasurement(previous?.[field])) return null;
  const a = Number(current[field]);
  const b = Number(previous[field]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Number((a - b).toFixed(2));
}

function projection(current, change, field) {
  if (!hasMeasurement(current?.[field])) return null;
  const value = Number(current[field]);
  if (!Number.isFinite(value) || !Number.isFinite(change)) return null;
  return Number((value + change * 3).toFixed(2));
}

function rounded(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function elapsedDays(current, previous) {
  const currentDate = new Date(`${String(current?.assessment_date || '').slice(0, 10)}T12:00:00Z`);
  const previousDate = new Date(`${String(previous?.assessment_date || '').slice(0, 10)}T12:00:00Z`);
  const difference = Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000);
  return Number.isFinite(difference) && difference > 0 ? difference : 1;
}

function wasMeasured(current, previous, field) {
  const measured = current?.measurement_sources?.measured;
  if (Array.isArray(measured)) return measured.includes(field);
  if (field === 'weight_kg') return hasMeasurement(current?.weight_kg);
  const fieldDelta = numericDelta(current, previous, field);
  const weightDelta = numericDelta(current, previous, 'weight_kg');
  return !(weightDelta !== null && weightDelta !== 0 && fieldDelta === 0);
}

function metric(value, previousValue, source, confidence, explanation) {
  const currentNumber = hasMeasurement(value) ? Number(value) : null;
  const previousNumber = hasMeasurement(previousValue) ? Number(previousValue) : null;
  return {
    value: Number.isFinite(currentNumber) ? rounded(currentNumber) : null,
    previous: Number.isFinite(previousNumber) ? rounded(previousNumber) : null,
    delta: Number.isFinite(currentNumber) && Number.isFinite(previousNumber) ? rounded(currentNumber - previousNumber) : null,
    source,
    confidence: source === 'measured' ? 'high' : confidence,
    explanation
  };
}

function buildIntelligentMetrics(current, previous, options = {}) {
  const result = {};
  const weightDelta = numericDelta(current, previous, 'weight_kg');
  const currentWeight = Number(current?.weight_kg); const previousWeight = Number(previous?.weight_kg);
  const days = elapsedDays(current, previous); const weeks = Math.max(days / 7, 1 / 7);
  const expectedSessions = Math.max(weeks * 2, 1);
  const trainingSessions = Math.max(Number(options.trainingSessions) || 0, 0);
  const trainingConsistency = clamp(trainingSessions / expectedSessions, 0, 1);
  const confidence = days >= 28 && hasMeasurement(previous?.body_fat_percent) && hasMeasurement(previous?.muscle_mass_kg) ? 'medium' : 'low';
  result.weight_kg = metric(current?.weight_kg, previous?.weight_kg, 'measured', 'high', 'Valor informado na medição.');

  if (weightDelta === null || !Number.isFinite(currentWeight) || !Number.isFinite(previousWeight) || previousWeight <= 0) {
    for (const field of ['body_fat_percent', 'muscle_mass_kg', 'waist_cm']) result[field] = metric(current?.[field], previous?.[field], wasMeasured(current, previous, field) ? 'measured' : 'carried', 'low', 'Não há variação de peso suficiente para estimar este dado.');
    return result;
  }

  let estimatedMuscleDelta = 0;
  if (weightDelta < 0) {
    estimatedMuscleDelta = trainingConsistency >= 0.45 && days >= 28
      ? Math.min(Math.abs(weightDelta) * 0.1, weeks * 0.08, 1.5)
      : -Math.abs(weightDelta) * (0.14 - trainingConsistency * 0.09);
  } else if (weightDelta > 0) {
    estimatedMuscleDelta = weightDelta * (0.28 + trainingConsistency * 0.42);
  } else if (trainingConsistency >= 0.45 && days >= 28) {
    estimatedMuscleDelta = Math.min(weeks * 0.05, 0.8);
  }

  const previousMuscle = Number(previous?.muscle_mass_kg);
  const estimatedMuscle = Number.isFinite(previousMuscle) ? Math.max(0, previousMuscle + estimatedMuscleDelta) : null;
  const previousFatPercent = Number(previous?.body_fat_percent);
  let estimatedFatPercent = null;
  if (Number.isFinite(previousFatPercent)) {
    const previousFatMass = previousWeight * previousFatPercent / 100;
    const estimatedFatMassDelta = weightDelta - estimatedMuscleDelta;
    estimatedFatPercent = clamp(((previousFatMass + estimatedFatMassDelta) / currentWeight) * 100, 2, 70);
  }
  const previousWaist = Number(previous?.waist_cm);
  const estimatedWaist = Number.isFinite(previousWaist) ? Math.max(20, previousWaist * (1 + (weightDelta / previousWeight) * 0.78)) : null;

  const estimates = {
    body_fat_percent: [estimatedFatPercent, `Estimativa baseada na mudança de ${Math.abs(weightDelta).toFixed(2).replace('.', ',')} kg em ${days} dia(s).`],
    muscle_mass_kg: [estimatedMuscle, trainingSessions ? `Estimativa considera ${trainingSessions} treino(s) registrado(s) no período.` : 'Estimativa conservadora; registre seus treinos para aumentar a confiança.'],
    waist_cm: [estimatedWaist, 'Estimativa proporcional à variação de peso; confirme com fita métrica.']
  };
  for (const field of Object.keys(estimates)) {
    const measured = wasMeasured(current, previous, field);
    const [estimatedValue, explanation] = estimates[field];
    result[field] = measured
      ? metric(current?.[field], previous?.[field], 'measured', 'high', 'Valor informado na medição.')
      : metric(estimatedValue, previous?.[field], 'estimated', confidence, explanation);
  }
  return result;
}

function buildProgressAnalysis(current, previous, goals = [], options = {}) {
  if (!current) return { status: 'empty', title: 'Comece seu acompanhamento', message: 'Registre sua primeira medição para acompanhar sua evolução.' };
  if (!previous) return { status: 'baseline', title: 'Primeira medição registrada', message: 'Esta avaliação será sua base de comparação para os próximos lançamentos.', projection: null };

  const delta = {
    weight_kg: numericDelta(current, previous, 'weight_kg'),
    body_fat_percent: numericDelta(current, previous, 'body_fat_percent'),
    muscle_mass_kg: numericDelta(current, previous, 'muscle_mass_kg'),
    waist_cm: numericDelta(current, previous, 'waist_cm')
  };
  const metrics = buildIntelligentMetrics(current, previous, options);
  const change = (field) => metrics[field]?.source === 'estimated' ? metrics[field].delta : delta[field];
  const qualifier = (field, label) => metrics[field]?.source === 'estimated' ? `${label} estimada` : label;
  const signals = [];
  if (change('weight_kg') !== null && change('weight_kg') !== 0) signals.push(`peso ${change('weight_kg') < 0 ? 'reduziu' : 'subiu'} ${Math.abs(change('weight_kg')).toFixed(2).replace('.', ',')} kg`);
  if (change('body_fat_percent') !== null && change('body_fat_percent') !== 0) signals.push(`${qualifier('body_fat_percent', 'gordura corporal')} ${change('body_fat_percent') < 0 ? 'caiu' : 'subiu'} ${Math.abs(change('body_fat_percent')).toFixed(2).replace('.', ',')} p.p.`);
  if (change('muscle_mass_kg') !== null && change('muscle_mass_kg') !== 0) signals.push(`${qualifier('muscle_mass_kg', 'massa muscular')} ${change('muscle_mass_kg') > 0 ? 'subiu' : 'caiu'} ${Math.abs(change('muscle_mass_kg')).toFixed(2).replace('.', ',')} kg`);
  if (change('waist_cm') !== null && change('waist_cm') !== 0) signals.push(`${qualifier('waist_cm', 'cintura')} ${change('waist_cm') < 0 ? 'reduziu' : 'subiu'} ${Math.abs(change('waist_cm')).toFixed(2).replace('.', ',')} cm`);
  if (!signals.length) signals.push('continue registrando medições para identificar tendências com mais confiança');

  const estimatedNames = Object.entries(metrics).filter(([, item]) => item.source === 'estimated').map(([field]) => ({ body_fat_percent: 'gordura', muscle_mass_kg: 'massa muscular', waist_cm: 'cintura' })[field]);
  return {
    status: 'comparison',
    title: 'Análise inteligente do progresso',
    message: `Desde a ${options.comparisonLabel || 'avaliação anterior'}, ${signals.join(' e ')}.`,
    delta,
    metrics,
    estimated_fields: estimatedNames,
    projection: options.includeProjection === false ? null : {
      months: 3,
      weight_kg: projection(current, delta.weight_kg, 'weight_kg'),
      body_fat_percent: projection(current, delta.body_fat_percent, 'body_fat_percent'),
      muscle_mass_kg: projection(current, delta.muscle_mass_kg, 'muscle_mass_kg'),
      waist_cm: projection(current, delta.waist_cm, 'waist_cm')
    },
    goal_count: goals.length,
    disclaimer: estimatedNames.length
      ? `Gordura, massa muscular e medidas não informadas são estimativas inteligentes de ${metrics.body_fat_percent?.confidence === 'medium' ? 'confiança moderada' : 'baixa confiança'}, não medições. Confirme-as em uma avaliação profissional.`
      : 'Análise automática baseada nas medições informadas. Não substitui a avaliação do profissional.'
  };
}

module.exports = { ASSESSMENT_MEASUREMENT_FIELDS, buildIntelligentMetrics, buildProgressAnalysis, carryForwardAssessments };
