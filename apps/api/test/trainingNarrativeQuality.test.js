const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeNarrativeWithRules } = require('../services/localTrainingAiService');

const rules = {
  summary: 'A ficha precisa de revisão do professor antes de qualquer progressão.',
  status: 'professional_review',
  confidence: 0.57,
  requires_human_review: true,
  signals: [],
  suggestions: []
};

test('usa o resumo das regras quando a narrativa termina incompleta', () => {
  const result = mergeNarrativeWithRules({
    summary: 'O plano inclui 3 rep',
    student_message: 'Continue seguindo as orientações do professor.',
    trainer_notes: 'Revisar os registros disponíveis.'
  }, rules);
  assert.equal(result.summary, rules.summary);
});

test('mantém narrativa clara quando ela termina em frase completa', () => {
  const summary = 'A ficha está organizada, mas os poucos registros exigem revisão do professor.';
  const result = mergeNarrativeWithRules({
    summary,
    student_message: 'Continue seguindo as orientações do professor.',
    trainer_notes: 'Revisar os registros disponíveis.'
  }, rules);
  assert.equal(result.summary, summary);
});
