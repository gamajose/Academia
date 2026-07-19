const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProgressReviewPayload,
  progressReviewHash,
  persistProgressReview,
  listProgressReviewHistory
} = require('../lib/progressReviewHistory');

const GYM_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function payload() {
  return buildProgressReviewPayload({
    assessments: [
      { id: 'a1', assessment_date: '2026-07-19', weight_kg: 70, email: 'nao@salvar.com' },
      { id: 'a2', assessment_date: '2026-06-19', weight_kg: 71, phone: '9999' }
    ],
    baseline: { id: 'a2', assessment_date: '2026-06-19', weight_kg: 71, notes: 'privado' },
    goals: [{ goal_type: 'Peso', target_value: 68, status: 'active', notes: 'privado' }],
    trainingSessions: 4,
    analysis: { status: 'comparison', title: 'Análise do progresso' },
    recentAnalysis: { status: 'comparison', title: 'Evolução recente', metrics: { weight_kg: { value: 70, delta: -1 } } }
  });
}

test('monta snapshot enxuto e sem dados pessoais desnecessários', () => {
  const result = payload();
  assert.equal(result.assessment_count, 2);
  assert.equal(result.active_goal_count, 1);
  assert.equal(result.training_sessions, 4);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /nao@salvar|9999|privado/);
  assert.equal(result.assessments[0].weight_kg, 70);
});

test('gera hash estável para evitar registros duplicados', () => {
  assert.equal(progressReviewHash(payload()), progressReviewHash(payload()));
  assert.equal(progressReviewHash(payload()).length, 64);
});

test('persiste uma análise nova e reaproveita a existente quando o snapshot não muda', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [{ id: 'review-1', created_at: '2026-07-19T22:00:00Z' }] };
  };
  const result = await persistProgressReview(query, { gym_id: GYM_ID, sub: USER_ID }, MEMBER_ID, payload());
  assert.equal(result.id, 'review-1');
  assert.equal(result.created, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].params.slice(0, 2), [GYM_ID, MEMBER_ID]);
});

test('lista o histórico isolado por academia e aluno', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'review-1', created_at: '2026-07-19T22:00:00Z', payload: payload() }] };
  };
  const result = await listProgressReviewHistory(query, GYM_ID, MEMBER_ID, 500);
  assert.equal(result.length, 1);
  assert.equal(result[0].assessment_count, 2);
  assert.deepEqual(calls[0].params, [GYM_ID, MEMBER_ID, 100]);
  assert.match(calls[0].sql, /WHERE gym_id = \$1 AND member_id = \$2/);
});
