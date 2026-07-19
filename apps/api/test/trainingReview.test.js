const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateTrainingReview
} = require('../lib/trainingReviewSchema');
const {
  cleanText,
  anonymizedMemberId
} = require('../lib/trainingReviewSnapshot');
const {
  generateLocalTrainingReview,
  prepareModelInput,
  requestOllama
} = require('../services/localTrainingAiService');
const {
  canGenerate,
  acquireGenerationLock,
  decideTrainingReview,
  latestApprovedStudentMessage,
  listTrainingReviews,
  reviewTrainingPlan
} = require('../services/trainingReviewService');
const { buildTrainingReview } = require('../features/trainingRules');

const GYM_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_GYM_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const CURRENT_EXERCISE_ID = '66666666-6666-4666-8666-666666666666';
const SUGGESTED_EXERCISE_ID = '77777777-7777-4777-8777-777777777777';
const REVIEW_ID = '88888888-8888-4888-8888-888888888888';

function candidate(overrides = {}) {
  return {
    summary: 'A ficha pode ser mantida com acompanhamento profissional.',
    status: 'maintain',
    confidence: 0.72,
    requires_human_review: false,
    signals: [{
      type: 'adherence',
      severity: 'info',
      description: 'Frequência compatível com o período.',
      evidence: ['Adesão de 80%']
    }],
    suggestions: [{
      type: 'keep_plan',
      priority: 'low',
      muscle_group: null,
      current_exercise_id: CURRENT_EXERCISE_ID,
      current_exercise: 'nome ignorado',
      suggested_exercise_id: null,
      suggested_exercise: null,
      suggested_action: 'Manter a ficha atual.',
      reason: 'Os registros estão estáveis.',
      target_sets: 3,
      target_reps: '10-12',
      target_rest_seconds: 60
    }],
    student_message: 'Continue registrando seus treinos.',
    trainer_notes: 'Reavaliar na próxima janela.',
    ...overrides
  };
}

function context() {
  return {
    planExercises: [{ exercise_id: CURRENT_EXERCISE_ID, exercise_name: 'Agachamento' }],
    catalog: [{ id: SUGGESTED_EXERCISE_ID, name: 'Leg press' }]
  };
}

function snapshot(overrides = {}) {
  return {
    subject_id: 'anonimo-123',
    objective: 'Melhorar condicionamento',
    level: 'intermediario',
    restrictions: [],
    planned_days_per_week: 3,
    plan: {
      age_days: 30,
      days: [{ weekday: 1, title: 'Treino A' }],
      exercises: [{
        exercise_id: CURRENT_EXERCISE_ID,
        name: 'Agachamento',
        weekday: 1,
        muscle_group_primary: 'Pernas',
        muscle_group_secondary: 'Glúteos',
        sets: 3,
        reps: '10-12',
        rest_seconds: 60,
        load_hint: null
      }]
    },
    execution_summary: {
      considered_sessions: 8,
      completed_sessions: 7,
      expected_sessions: 9,
      adherence_rate: 0.778
    },
    executions: Array.from({ length: 7 }, (_, index) => ({
      status: 'completed',
      feedback: index === 0 ? 'Execução normal' : null,
      perceived_effort: 6,
      completed_at: '2026-07-18T12:00:00Z'
    })),
    exercise_executions: [],
    assessments: [
      { assessment_date: '2026-07-18', weight_kg: 70 },
      { assessment_date: '2026-06-18', weight_kg: 71 }
    ],
    active_goals: [],
    previous_reviews: [],
    exercise_catalog: [{
      id: SUGGESTED_EXERCISE_ID,
      name: 'Leg press',
      muscle_group_primary: 'Pernas',
      muscle_group_secondary: null,
      equipment: 'Máquina',
      level: 'intermediario'
    }],
    ...overrides
  };
}

function rules(data = snapshot()) {
  return buildTrainingReview({ snapshot: data, planAgeDays: data.plan.age_days, level: data.level });
}

function ollamaResponse(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(content)
  };
}

test('valida saída estruturada e corrige nomes pelos IDs autorizados', () => {
  const result = validateTrainingReview(candidate(), context());
  assert.equal(result.suggestions[0].current_exercise, 'Agachamento');
});

test('rejeita JSON incompleto, campos extras e exercícios de outra academia', () => {
  assert.throws(() => validateTrainingReview({ summary: 'incompleto' }, context()));
  assert.throws(() => validateTrainingReview(candidate({ segredo: 'não permitido' }), context()));
  const foreign = candidate();
  foreign.suggestions[0].suggested_exercise_id = OTHER_GYM_ID;
  assert.throws(() => validateTrainingReview(foreign, context()), /exercicio_sugerido_invalido/);
});

test('minimiza dados pessoais antes de montar o prompt', () => {
  const data = snapshot();
  const input = prepareModelInput(data, rules(data));
  const serialized = JSON.stringify(input);
  assert.doesNotMatch(serialized, /nome|email|telefone|cpf|endereço/i);
  assert.equal(input.subject_id, 'anonimo-123');
  assert.equal(cleanText('jose@example.com (32) 99999-0000 123.456.789-00'), '[removido] [removido] [removido]');
  assert.notEqual(anonymizedMemberId(GYM_ID, MEMBER_ID), anonymizedMemberId(OTHER_GYM_ID, MEMBER_ID));
});

test('gera análise local com Structured Outputs e sem aplicar mudanças', async () => {
  process.env.LOCAL_TRAINING_AI_ENABLED = 'true';
  process.env.LOCAL_TRAINING_MAX_RETRIES = '0';
  const data = snapshot();
  let sent;
  const result = await generateLocalTrainingReview({
    snapshot: data,
    rules: rules(data),
    ...context(),
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return ollamaResponse({
        message: { content: JSON.stringify(candidate()) },
        prompt_eval_count: 10,
        eval_count: 20
      });
    }
  });
  assert.equal(result.source, 'local_generative');
  assert.equal(result.tokenUsage.total_tokens, 30);
  assert.equal(sent.stream, false);
  assert.equal(sent.keep_alive, 0);
  assert.equal(sent.format.type, 'object');
  assert.equal(sent.messages[1].content.includes('jose@example.com'), false);
});

test('trata timeout, resposta inválida, JSON incompleto e modelo ausente', async () => {
  process.env.LOCAL_TRAINING_AI_ENABLED = 'true';
  process.env.LOCAL_TRAINING_MAX_RETRIES = '0';
  const data = snapshot();
  const base = { snapshot: data, rules: rules(data), ...context() };

  await assert.rejects(
    generateLocalTrainingReview({ ...base, fetchImpl: async () => { const error = new Error('abort'); error.name = 'AbortError'; throw error; } }),
    /ollama_timeout/
  );
  await assert.rejects(
    generateLocalTrainingReview({ ...base, fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>' }) }),
    /ollama_resposta_http_invalida/
  );
  await assert.rejects(
    generateLocalTrainingReview({ ...base, fetchImpl: async () => ollamaResponse({ message: { content: JSON.stringify({ summary: 'incompleto' }) } }) }),
    /resposta_invalida|mensagem_aluno_invalida/
  );
  await assert.rejects(
    requestOllama({}, { fetchImpl: async () => ollamaResponse({ error: 'not found' }, 404) }),
    /ollama_modelo_nao_encontrado/
  );
});

test('dor, restrições e poucos dados obrigam revisão profissional', () => {
  const data = snapshot({
    restrictions: ['Restrição cadastrada'],
    assessments: [{ assessment_date: '2026-07-18', weight_kg: 70 }],
    exercise_executions: [{ pain_level: 7 }],
    executions: [{ status: 'completed', feedback: 'Senti dor', perceived_effort: 9 }]
  });
  const result = rules(data);
  assert.equal(result.requires_human_review, true);
  assert.equal(result.status, 'professional_review');
  assert.ok(result.signals.some((item) => item.type === 'restriction' && item.severity === 'critical'));
});

test('acesso à geração é restrito a administradores e profissionais autorizados', () => {
  assert.equal(canGenerate({ role: 'owner' }), true);
  assert.equal(canGenerate({ role: 'staff', access_profile: 'trainer' }), true);
  assert.equal(canGenerate({ role: 'staff', access_permissions: { training: true } }), true);
  assert.equal(canGenerate({ role: 'student' }), false);
});

test('trava global impede uma segunda análise simultânea', async () => {
  await assert.rejects(
    acquireGenerationLock(async () => ({ rowCount: 0, rows: [] }), {
      gym_id: GYM_ID,
      sub: USER_ID
    }, PLAN_ID),
    /analise_em_andamento/
  );
});

test('histórico e decisões sempre ficam isolados por academia', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 1, rows: [{ id: REVIEW_ID, plan_id: PLAN_ID, summary: 'ok', signals: [], suggestions: [] }] };
  };
  await listTrainingReviews(query, { role: 'admin', gym_id: GYM_ID }, PLAN_ID, 500);
  await decideTrainingReview(query, { role: 'admin', gym_id: OTHER_GYM_ID, sub: USER_ID }, REVIEW_ID, 'approved');
  assert.deepEqual(calls[0].params, [GYM_ID, PLAN_ID, 50]);
  assert.deepEqual(calls[1].params, [REVIEW_ID, OTHER_GYM_ID, USER_ID]);
  assert.match(calls[0].sql, /WHERE gym_id = \$1 AND plan_id = \$2/);
  assert.match(calls[1].sql, /WHERE id = \$1 AND gym_id = \$2/);
});

test('aprovação e rejeição são mutuamente exclusivas', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rowCount: 1, rows: [{ id: REVIEW_ID }] };
  };
  await decideTrainingReview(query, { role: 'admin', gym_id: GYM_ID, sub: USER_ID }, REVIEW_ID, 'approved');
  await decideTrainingReview(query, { role: 'admin', gym_id: GYM_ID, sub: USER_ID }, REVIEW_ID, 'rejected', 'Dados insuficientes');
  assert.match(calls[0].sql, /rejected_at = NULL/);
  assert.match(calls[1].sql, /approved_at = NULL/);
  assert.equal(calls[1].params[3], 'Dados insuficientes');
});

test('aluno recebe somente mensagem aprovada, sem notas internas', async () => {
  let captured;
  const row = {
    id: REVIEW_ID,
    plan_id: PLAN_ID,
    student_message: 'Mensagem aprovada',
    approved_at: '2026-07-19T10:00:00Z'
  };
  const result = await latestApprovedStudentMessage(async (sql, params) => {
    captured = { sql, params };
    return { rowCount: 1, rows: [row] };
  }, { role: 'student', gym_id: GYM_ID, member_id: MEMBER_ID });
  assert.deepEqual(result, row);
  assert.doesNotMatch(captured.sql, /trainer_notes|signals|suggestions/);
  assert.match(captured.sql, /approved_at IS NOT NULL AND rejected_at IS NULL/);
  assert.deepEqual(captured.params, [GYM_ID, MEMBER_ID]);
  await assert.rejects(
    latestApprovedStudentMessage(async () => ({ rows: [] }), { role: 'admin', gym_id: GYM_ID }),
    /sem_permissao/
  );
});

test('falha do Ollama persiste rules_fallback e sempre libera a trava', async () => {
  process.env.LOCAL_TRAINING_AI_ENABLED = 'true';
  process.env.LOCAL_TRAINING_MAX_RETRIES = '0';
  process.env.LOCAL_TRAINING_PLAN_COOLDOWN_SECONDS = '0';
  const state = { source: null, released: false, planUpdated: false };
  const query = async (sql, params) => {
    if (sql.includes('INSERT INTO training_ai_generation_locks')) return { rowCount: 1, rows: [{ lock_token: params[0] }] };
    if (sql.includes('DELETE FROM training_ai_generation_locks')) {
      state.released = true;
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('count(*) FILTER')) return { rowCount: 1, rows: [{ gym_hour: 0, plan_recent: 0 }] };
    if (sql.includes('FROM workout_plans wp')) {
      return {
        rowCount: 1,
        rows: [{
          id: PLAN_ID,
          member_id: MEMBER_ID,
          level: 'intermediario',
          goal: 'Condicionamento',
          status: 'active',
          starts_at: '2026-06-01',
          training_days_per_week: 3,
          age_days: 48
        }]
      };
    }
    if (sql.includes('FROM workout_days')) return { rowCount: 1, rows: [{ id: 'day', weekday: 1, title: 'A', notes: null }] };
    if (sql.includes('FROM workout_exercises we')) {
      return {
        rowCount: 1,
        rows: [{
          workout_exercise_id: 'workout-exercise',
          exercise_id: CURRENT_EXERCISE_ID,
          sets: 3,
          reps: '10-12',
          rest_seconds: 60,
          exercise_name: 'Agachamento',
          muscle_group: 'Pernas',
          muscle_group_primary: 'Pernas',
          weekday: 1,
          day_title: 'A'
        }]
      };
    }
    if (sql.includes('FROM workout_day_logs')) {
      return {
        rowCount: 4,
        rows: Array.from({ length: 4 }, () => ({
          status: 'completed',
          feedback: null,
          perceived_effort: 6,
          completed_at: new Date().toISOString()
        }))
      };
    }
    if (sql.includes('FROM workout_exercise_logs')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM member_assessments')) {
      return {
        rowCount: 2,
        rows: [
          { assessment_date: '2026-07-01', weight_kg: 70 },
          { assessment_date: '2026-06-01', weight_kg: 71 }
        ]
      };
    }
    if (sql.includes('FROM member_goals')) return { rowCount: 0, rows: [] };
    if (sql.includes('FROM exercise_library')) {
      return {
        rowCount: 2,
        rows: [
          { id: CURRENT_EXERCISE_ID, name: 'Agachamento', muscle_group: 'Pernas', muscle_group_primary: 'Pernas', level: 'intermediario' },
          { id: SUGGESTED_EXERCISE_ID, name: 'Leg press', muscle_group: 'Pernas', muscle_group_primary: 'Pernas', level: 'intermediario' }
        ]
      };
    }
    if (sql.includes('FROM workout_ai_reviews') && sql.includes('LIMIT 3')) return { rowCount: 0, rows: [] };
    if (sql.includes('INSERT INTO workout_ai_reviews')) {
      state.source = params[9];
      return {
        rowCount: 1,
        rows: [{
          id: REVIEW_ID,
          plan_id: PLAN_ID,
          source: params[9],
          model: params[10],
          prompt_version: params[11],
          status: params[12],
          confidence: params[7],
          requires_human_review: params[13],
          summary: params[4],
          signals: JSON.parse(params[14]),
          suggestions: JSON.parse(params[5]),
          student_message: params[15],
          trainer_notes: params[16],
          error_code: params[18],
          duration_ms: params[19],
          token_usage: JSON.parse(params[20]),
          created_at: new Date().toISOString()
        }]
      };
    }
    if (sql.includes('UPDATE workout_plans SET reviewed_at')) {
      state.planUpdated = true;
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`SQL não previsto no teste: ${sql.slice(0, 80)}`);
  };

  const result = await reviewTrainingPlan({
    query,
    user: { role: 'admin', gym_id: GYM_ID, sub: USER_ID },
    planId: PLAN_ID,
    fetchImpl: async () => { throw new Error('fetch failed'); }
  });
  assert.equal(result.source, 'rules_fallback');
  assert.equal(state.source, 'rules_fallback');
  assert.equal(state.released, true);
  assert.equal(state.planUpdated, true);
});
