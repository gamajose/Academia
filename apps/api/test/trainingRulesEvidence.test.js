const test = require('node:test');
const assert = require('node:assert/strict');
const { describeAssessment, buildTrainingReview } = require('../features/trainingRules');

test('descreve qual avaliação física foi considerada', () => {
  assert.deepEqual(
    describeAssessment({
      assessment_date: '2026-07-10',
      weight_kg: 81.4,
      body_fat_percent: 18.2,
      waist_cm: 88
    }),
    [
      'Avaliação realizada em 10/07/2026',
      'Peso: 81.4 kg',
      'Gordura corporal: 18.2%',
      'Cintura: 88.0 cm'
    ]
  );
});

test('mostra o conteúdo real da restrição em vez de um número genérico', () => {
  const review = buildTrainingReview({
    snapshot: {
      level: 'iniciante',
      restrictions: ['Evitar impacto no joelho direito'],
      executions: [],
      exercise_executions: [],
      assessments: [{ assessment_date: '2026-07-10', weight_kg: 81.4 }],
      execution_summary: { adherence_rate: 0.5 },
      plan: {
        age_days: 10,
        exercises: [{ exercise_id: '11111111-1111-4111-8111-111111111111', name: 'Supino', muscle_group_primary: 'Peito' }]
      }
    }
  });

  const restriction = review.signals.find((item) => item.type === 'restriction');
  const assessment = review.signals.find((item) => item.type === 'assessment');

  assert.deepEqual(restriction.evidence, ['Restrição informada: Evitar impacto no joelho direito']);
  assert.match(assessment.evidence[0], /10\/07\/2026/);
  assert.equal(review.requires_human_review, true);
});
