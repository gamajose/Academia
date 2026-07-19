const GOAL_MEASUREMENT_FIELDS = [
  { patterns: ['peso', 'weight', 'kg', 'quilo', 'emagrecer'], field: 'weight_kg' },
  { patterns: ['gordura', 'body fat', 'percentual de gordura'], field: 'body_fat_percent' },
  { patterns: ['massa muscular', 'musculo', 'músculo'], field: 'muscle_mass_kg' },
  { patterns: ['cintura'], field: 'waist_cm' },
  { patterns: ['peito', 'torax', 'tórax'], field: 'chest_cm' },
  { patterns: ['quadril'], field: 'hip_cm' },
  { patterns: ['biceps', 'bíceps', 'braco', 'braço'], field: 'biceps_cm' },
  { patterns: ['coxa'], field: 'left_thigh_cm' },
  { patterns: ['altura'], field: 'height_cm' }
];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function measurementFieldForGoal(goalType) {
  const type = normalize(goalType);
  return GOAL_MEASUREMENT_FIELDS.find(({ patterns }) => patterns.some((pattern) => type.includes(normalize(pattern))))?.field || null;
}

function finiteMeasurement(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function goalWasReached(goal, current, previous) {
  if (!goal || goal.status !== 'active') return false;
  const field = measurementFieldForGoal(goal.goal_type);
  const target = finiteMeasurement(goal.target_value);
  const currentValue = finiteMeasurement(current?.[field]);
  if (!field || target === null || currentValue === null) return false;
  if (currentValue === target) return true;

  const previousValue = finiteMeasurement(previous?.[field]);
  if (previousValue === null) return false;
  if (previousValue > target) return currentValue <= target;
  if (previousValue < target) return currentValue >= target;
  return true;
}

function reachedGoals(goals = [], current, previous) {
  return goals.filter((goal) => goalWasReached(goal, current, previous));
}

module.exports = { goalWasReached, measurementFieldForGoal, reachedGoals };
