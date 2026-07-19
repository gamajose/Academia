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
  shouldAttemptRecovery
} = require('../../web/training-review-ui');

test('normaliza confiança atual e registros legados', () => {
  assert.equal(confidencePercent(0.57), 57);
  assert.equal(confidencePercent('0.4'), 40);
  assert.equal(confidencePercent('40.00'), 40);
  assert.equal(confidencePercent(4000), 100);
  assert.equal(confidenceBand(0.57), 'moderada');
});

test('traduz status técnicos para linguagem clara', () => {
  assert.equal(statusLabel('professional_review'), 'Revisão do professor necessária');
  assert.equal(statusLabel('maintain'), 'Manter a ficha atual');
  assert.equal(statusLabel('replace_partially'), 'Substituir parte da ficha');
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
  assert.match(text, /revisão do professor necessária/i);
  assert.match(text, /manter a ficha atual/i);
  assert.match(text, /3 pontos de atenção/i);
  assert.doesNotMatch(text, /professional_review|maintain/);
});

test('substitui resumo cortado por uma mensagem completa', () => {
  assert.equal(
    safeSummary({ summary: 'O plano inclui 3 rep', status: 'professional_review', requires_human_review: true }),
    'A ficha precisa de revisão do professor antes de qualquer progressão.'
  );
});

test('preserva resumo completo da análise', () => {
  const summary = 'A ficha está organizada, mas precisa de acompanhamento do professor.';
  assert.equal(safeSummary({ summary, status: 'adjust' }), summary);
});

test('explica ausência de dados sem mostrar zero como resultado', () => {
  assert.equal(confidenceText(0), 'Dados insuficientes para medir a confiabilidade');
  assert.equal(confidenceText(0.73), 'Confiabilidade dos dados: 73% (alta)');
});

test('evita recomendação contraditória quando revisão humana é necessária', () => {
  assert.equal(
    recommendationLabel({ status: 'maintain', requires_human_review: true }),
    'Manter a ficha até a revisão do professor'
  );
});

test('recupera falhas de transporte, mas respeita bloqueios de negócio', () => {
  assert.equal(shouldAttemptRecovery(new Error('fetch failed')), true);
  assert.equal(shouldAttemptRecovery(new Error('analise_em_andamento')), true);
  assert.equal(shouldAttemptRecovery(new Error('aguarde_nova_analise')), false);
  assert.equal(shouldAttemptRecovery(new Error('limite_horario_atingido')), false);
});
