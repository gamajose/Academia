const test = require('node:test');
const assert = require('node:assert/strict');
const {
  confidencePercent,
  confidenceBand,
  statusLabel,
  humanizeText,
  safeSummary,
  comparisonText
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
