const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrainingIntelligence, MODEL_VERSION } = require('../lib/trainingIntelligence');

function catalog() {
  return [
    { id: 'squat', name: 'Agachamento livre', muscle_group: 'Pernas e Glúteos', level: 'intermediario', is_active: true },
    { id: 'row', name: 'Remada baixa', muscle_group: 'Costas', level: 'intermediario', is_active: true },
    { id: 'curl', name: 'Rosca direta', muscle_group: 'Bíceps', level: 'intermediario', is_active: true }
  ];
}

test('detecta alto desempenho com aderência e evolução alinhadas ao emagrecimento', () => {
  const result = buildTrainingIntelligence({
    profile: { goal: 'Emagrecimento e definição', level: 'intermediario', training_days_per_week: 3 },
    plan: { id: 'plan' }, goals: [], catalog: catalog(), exercises: [],
    assessments: [
      { weight_kg: 77, body_fat_percent: 20, muscle_mass_kg: 35, waist_cm: 82 },
      { weight_kg: 80, body_fat_percent: 23, muscle_mass_kg: 34.8, waist_cm: 87 }
    ],
    logs: Array.from({ length: 12 }, () => ({ status: 'completed', perceived_effort: 7 })), exerciseLogs: Array.from({ length: 6 }, () => ({ perceived_effort: 7, pain_level: 0 }))
  });
  assert.equal(result.model_version, MODEL_VERSION);
  assert.equal(result.performance.level, 'high');
  assert.ok(result.performance.score >= 75);
  assert.match(result.performance.student_message, /Continue/i);
});

test('prioriza aderência antes de aumentar volume quando há poucos treinos', () => {
  const result = buildTrainingIntelligence({ profile: { goal: 'Hipertrofia', training_days_per_week: 4 }, plan: { id: 'p' }, assessments: [{}, {}], logs: [{ status: 'completed' }], catalog: catalog() });
  assert.ok(result.adherence.rate < 45);
  assert.ok(result.plan_review.recommendations.some((text) => /aderência/i.test(text)));
});

test('sinaliza dor e exige revisão profissional', () => {
  const result = buildTrainingIntelligence({ profile: { goal: 'Força', restrictions: 'lesão no joelho' }, plan: { id: 'p' }, assessments: [{}, {}], logs: Array.from({ length: 8 }, () => ({ status: 'completed' })), exerciseLogs: [{ pain_level: 7 }, { pain_level: 6 }], catalog: catalog() });
  assert.equal(result.safety.requires_professional_review, true);
  assert.equal(result.performance.level, 'attention');
  assert.ok(result.plan_review.risks.length >= 2);
});

test('não recomenda exercício já presente e explica a lacuna coberta', () => {
  const result = buildTrainingIntelligence({ profile: { goal: 'Hipertrofia', level: 'intermediario' }, plan: { id: 'p' }, assessments: [], logs: [], catalog: catalog(), exercises: [{ exercise_id: 'squat', name: 'Agachamento livre', muscle_group: 'Pernas e Glúteos' }] });
  assert.ok(!result.exercise_recommendations.some((item) => item.exercise_id === 'squat'));
  assert.ok(result.exercise_recommendations.some((item) => item.exercise_id === 'row'));
});

test('feedback do personal calibra o ranking com suavização bayesiana', () => {
  const result = buildTrainingIntelligence({ profile: { goal: 'Hipertrofia', level: 'intermediario' }, plan: { id: 'p' }, catalog: catalog(), feedbackStats: [{ recommendation_key: 'row', total: 8, positive: 8 }, { recommendation_key: 'curl', total: 8, positive: 0 }] });
  const row = result.exercise_recommendations.find((item) => item.exercise_id === 'row');
  const curl = result.exercise_recommendations.find((item) => item.exercise_id === 'curl');
  assert.ok(row.score > curl.score);
  assert.equal(row.learning.observations, 8);
  assert.ok(row.learning.acceptance_probability > 0.5);
});
