const test = require('node:test');
const assert = require('node:assert/strict');
const {
  confidencePercent,
  confidenceBand,
  confidenceText,
  statusLabel,
  recommendationLabel,
  humanizeText,
  safeSummary,
  comparisonText,
  shouldAttemptRecovery,
  cleanEvidence,
  firstPercentage,
  firstScaleTen
} = require('../../web/training-review-ui');

test('normaliza confiança atual e registros legados', () => {
  assert.equal(confidencePercent(0.57), 57);
  assert.equal(confidencePercent('0.4'), 40);
  assert.equal(confidencePercent('40.00'), 40);
  assert.equal(confidencePercent(4000), 100);
  assert.equal(confidenceBand(0.57), 'moderada');
});

test('traduz status técnicos para ações claras', () => {
  assert.equal(statusLabel('professional_review'), 'Solicite revisão do professor.');
  assert.equal(statusLabel('maintain'), 'Mantenha a ficha atual.');
  assert.equal(statusLabel('replace_partially'), 'Revise parte da ficha.');
});

test('remove termos técnicos de textos antigos', () => {
  assert.equal(humanizeText('Meta classificada como fat_loss'), 'Meta classificada como redução de gordura');
  assert.equal(humanizeText('status professional_review'), 'status revisão do professor');
});

test('comparação não exibe enumerações internas', () => {
  const text = comparisonText([
    { status: 'professional_review', signals: [{}, {}, {}] },
    { status: 'maintain', signals: [] }
  ]);
  assert.match(text, /solicite revisão do professor/i);
  assert.match(text, /mantenha a ficha atual/i);
  assert.match(text, /3 vs\. 0/i);
  assert.doesNotMatch(text, /professional_review|maintain/);
});

test('não mostra resumo cortado no dashboard', () => {
  assert.equal(
    safeSummary({ summary: 'O plano inclui 3 rep', status: 'professional_review', requires_human_review: true }),
    ''
  );
});

test('preserva resumo completo para compatibilidade', () => {
  const summary = 'A ficha está organizada, mas precisa de acompanhamento do professor.';
  assert.equal(safeSummary({ summary, status: 'adjust' }), summary);
});

test('explica ausência de dados sem mostrar zero como resultado', () => {
  assert.equal(confidenceText(0), 'Dados insuficientes para medir a confiabilidade');
  assert.equal(confidenceText(0.73), '73% de confiabilidade');
});

test('prioriza solicitação de revisão quando necessária', () => {
  assert.equal(
    recommendationLabel({ status: 'maintain', requires_human_review: true }),
    'Solicite revisão do professor.'
  );
});

test('recupera falhas de transporte, mas respeita bloqueios de negócio', () => {
  assert.equal(shouldAttemptRecovery(new Error('fetch failed')), true);
  assert.equal(shouldAttemptRecovery(new Error('analise_em_andamento')), true);
  assert.equal(shouldAttemptRecovery(new Error('aguarde_nova_analise')), false);
  assert.equal(shouldAttemptRecovery(new Error('limite_horario_atingido')), false);
});

test('remove evidência genérica e marcadores de ausência de restrição', () => {
  assert.deepEqual(
    cleanEvidence([
      'Restrição cadastrada 1',
      'Restrição informada: Sem restrições informadas',
      'Restrição informada: dor no joelho'
    ]),
    ['Restrição informada: dor no joelho']
  );
  assert.equal(firstPercentage(['Adesão calculada: 57%']), 57);
  assert.equal(firstScaleTen(['Esforço médio: 8.5/10']), 8.5);
});
