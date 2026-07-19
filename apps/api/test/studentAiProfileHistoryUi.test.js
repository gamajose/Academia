const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..', '..', 'web');
const html = fs.readFileSync(path.join(webRoot, 'alunos.html'), 'utf8');
const js = fs.readFileSync(path.join(webRoot, 'alunos.js'), 'utf8');
const css = fs.readFileSync(path.join(webRoot, 'product-layout.css'), 'utf8');
const route = fs.readFileSync(path.join(__dirname, '..', 'features', 'assessmentRoutes.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database', '059_member_progress_ai_reviews.sql'), 'utf8');

test('histórico do perfil lista análises com IA em itens expansíveis', () => {
  assert.match(html, /Histórico de análises com IA/);
  assert.match(html, /student-view-ai-history-list/);
  assert.match(js, /studentAiHistoryEntry/);
  assert.match(js, /document\.createElement\('details'\)/);
  assert.match(js, /Ocultar detalhes/);
});

test('aba IA mantém a análise atual e oferece modal de histórico', () => {
  assert.match(html, /id="student-view-ai-history-button"/);
  assert.match(html, /id="student-ai-history-modal"/);
  assert.match(js, /openStudentAiHistoryModal/);
  assert.match(js, /\/api\/assessments\/analysis\/history/);
});

test('ações de avaliação ficam dentro do conteúdo de cadastro', () => {
  const identityPosition = html.indexOf('student-view-identity');
  const actionsPosition = html.indexOf('student-view-registration-actions');
  const gridPosition = html.indexOf('student-view-grid');
  assert.ok(identityPosition >= 0 && actionsPosition > identityPosition && gridPosition > actionsPosition);
});

test('histórico possui estilo de acordeão responsivo', () => {
  assert.match(css, /\.student-ai-history-entry/);
  assert.match(css, /\.student-ai-history-body/);
  assert.match(css, /student-ai-tab-toolbar/);
});

test('API persiste e lista análises por academia e aluno', () => {
  assert.match(route, /persistProgressReview/);
  assert.match(route, /listProgressReviewHistory/);
  assert.match(route, /\/api\/assessments\/analysis\/history/);
  assert.match(migration, /member_progress_ai_reviews/);
  assert.match(migration, /UNIQUE INDEX/);
});
