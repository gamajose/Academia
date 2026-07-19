const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TRAINING_NARRATIVE_JSON_SCHEMA,
  validateTrainingNarrative
} = require('../lib/trainingReviewSchema');
const {
  generateLocalTrainingReview,
  mergeNarrativeWithRules,
  prepareModelInput
} = require('../services/localTrainingAiService');

const CURRENT_EXERCISE_ID = '66666666-6666-4666-8666-666666666666';

function rules() {
  return {
    summary: 'Resumo objetivo das regras.',
    status: 'professional_review',
    confidence: 0.57,
    requires_human_review: true,
    signals: [{
      type: 'restriction',
      severity: 'critical',
      description: 'Há restrição cadastrada.',
      evidence: ['Restrição cadastrada 1']
    }],
    suggestions: [{
      type: 'professional_review',
      priority: 'high',
      muscle_group: null,
      current_exercise_id: null,
      current_exercise: null,
      suggested_exercise_id: null,
      suggested_exercise: null,
      suggested_action: 'Revisar presencialmente.',
      reason: 'A restrição exige decisão profissional.',
      target_sets: null,
      target_reps: null,
      target_rest_seconds: null
    }],
    student_message: 'Mensagem original das regras.',
    trainer_notes: 'Notas originais das regras.'
  };
}

function snapshot() {
  return {
    subject_id: 'anonimo-123',
    objective: 'Condicionamento geral',
    level: 'iniciante',
    restrictions: ['Restrição cadastrada'],
    planned_days_per_week: 3,
    plan: {
      age_days: 20,
      days: [{ weekday: 1, title: 'Treino A' }],
      exercises: [{
        exercise_id: CURRENT_EXERCISE_ID,
        name: 'Agachamento',
        weekday: 1,
        muscle_group_primary: 'Pernas',
        sets: 3,
        reps: '10-12',
        rest_seconds: 60
      }]
    },
    execution_summary: {
      considered_sessions: 2,
      completed_sessions: 2,
      expected_sessions: 6,
      adherence_rate: 0.333
    },
    executions: [{ status: 'completed', feedback: 'Execução controlada', perceived_effort: 7 }],
    exercise_executions: [],
    assessments: [{ assessment_date: '2026-07-10', weight_kg: 70 }],
    active_goals: [],
    previous_reviews: [],
    exercise_catalog: []
  };
}

function response(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body)
  };
}

test('schema narrativo exige somente três textos curtos e seguros', () => {
  assert.deepEqual(TRAINING_NARRATIVE_JSON_SCHEMA.required, ['summary', 'student_message', 'trainer_notes']);
  const value = validateTrainingNarrative({
    summary: 'A ficha requer acompanhamento.',
    student_message: 'Converse com seu professor antes de avançar.',
    trainer_notes: 'Revisar os sinais objetivos registrados.'
  });
  assert.equal(value.summary, 'A ficha requer acompanhamento.');
  assert.throws(() => validateTrainingNarrative({
    summary: '<strong>Resumo</strong>',
    student_message: 'Mensagem segura.',
    trainer_notes: 'Notas seguras.'
  }), /conteudo_narrativo_inseguro/);
  assert.throws(() => validateTrainingNarrative({
    summary: 'Use medicamento para recuperar.',
    student_message: 'Mensagem segura.',
    trainer_notes: 'Notas seguras.'
  }), /conteudo_narrativo_inseguro/);
});

test('narrativa nunca substitui status, confiança, sinais ou sugestões das regras', () => {
  const authoritative = rules();
  const merged = mergeNarrativeWithRules({
    summary: 'Explicação gerada localmente.',
    student_message: 'Mensagem curta ao aluno.',
    trainer_notes: 'Explicação curta ao profissional.'
  }, authoritative);
  assert.equal(merged.status, authoritative.status);
  assert.equal(merged.confidence, authoritative.confidence);
  assert.equal(merged.requires_human_review, true);
  assert.deepEqual(merged.signals, authoritative.signals);
  assert.deepEqual(merged.suggestions, authoritative.suggestions);
  assert.equal(merged.summary, 'Explicação gerada localmente.');
});

test('entrada do modelo é compacta e mantém somente contexto necessário', () => {
  const input = prepareModelInput(snapshot(), rules());
  const serialized = JSON.stringify(input);
  assert.equal(input.subject_id, 'anonimo-123');
  assert.equal(input.plan_summary.exercise_count, 1);
  assert.equal(input.authoritative_rules.requires_human_review, true);
  assert.ok(serialized.length < 5000);
  assert.doesNotMatch(serialized, /email|telefone|cpf|endereço/i);
});

test('geração local usa schema narrativo, limite de saída e preserva segurança das regras', async () => {
  process.env.LOCAL_TRAINING_AI_ENABLED = 'true';
  process.env.LOCAL_TRAINING_MAX_RETRIES = '0';
  process.env.OLLAMA_NUM_PREDICT = '96';
  let payload;
  const authoritative = rules();
  const generated = await generateLocalTrainingReview({
    snapshot: snapshot(),
    rules: authoritative,
    planExercises: [{ exercise_id: CURRENT_EXERCISE_ID, exercise_name: 'Agachamento' }],
    catalog: [],
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return response({
        message: {
          content: JSON.stringify({
            summary: 'A ficha precisa de revisão profissional antes de avançar.',
            student_message: 'Converse com seu professor antes de mudar o treino.',
            trainer_notes: 'A explicação foi baseada nos sinais objetivos já calculados.'
          })
        },
        prompt_eval_count: 40,
        eval_count: 60
      });
    }
  });

  assert.equal(generated.source, 'local_generative');
  assert.equal(generated.review.status, 'professional_review');
  assert.equal(generated.review.requires_human_review, true);
  assert.deepEqual(generated.review.signals, authoritative.signals);
  assert.deepEqual(generated.review.suggestions, authoritative.suggestions);
  assert.deepEqual(payload.format.required, ['summary', 'student_message', 'trainer_notes']);
  assert.equal(payload.options.num_predict, 96);
  assert.equal(generated.tokenUsage.total_tokens, 100);
});
