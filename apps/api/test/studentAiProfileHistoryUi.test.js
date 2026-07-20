const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..', '..', 'web');
const apiRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(webRoot, 'alunos.html'), 'utf8');
const js = fs.readFileSync(path.join(webRoot, 'alunos.js'), 'utf8');
const css = fs.readFileSync(path.join(webRoot, 'product-layout.css'), 'utf8');
const routes = fs.readFileSync(path.join(apiRoot, 'features', 'trainingPlansRoutes.js'), 'utf8');
const service = fs.readFileSync(path.join(apiRoot, 'services', 'trainingReviewService.js'), 'utf8');
const assessments = fs.readFileSync(path.join(apiRoot, 'features', 'assessmentRoutes.js'), 'utf8');

test('histórico do perfil usa as análises geradas no módulo Treinos', () => {
  assert.match(html, /Histórico da IA de treinos/);
  assert.match(js, /studentTrainingReviewHistoryEntry/);
  assert.match(js, /\/api\/training\/plans\/reviews\/member/);
  assert.doesNotMatch(js, /\/api\/assessments\/analysis\/history/);
  assert.match(routes, /listMemberTrainingReviews/);
  assert.match(service, /FROM workout_ai_reviews r/);
  assert.match(service, /r\.member_id = \$2/);
});

test('histórico continua expansível e mostra os dados da ficha', () => {
  assert.match(js, /document\.createElement\('details'\)/);
  assert.match(js, /Ficha: \$\{review\.plan_name\}/);
  assert.match(js, /Pontos identificados/);
  assert.match(js, /Próximos passos/);
  assert.match(js, /Ocultar análise/);
});

test('ações de avaliação ficam dentro do cartão principal do cadastro', () => {
  const identityStart = html.indexOf('<div class="student-view-identity">');
  const actions = html.indexOf('<div class="student-view-registration-actions">');
  const identityEnd = html.indexOf('</div>', actions);
  const grid = html.indexOf('<div class="student-view-grid">');
  assert.ok(identityStart >= 0 && actions > identityStart && identityEnd > actions && grid > identityEnd);
  assert.doesNotMatch(html, /student-view-context-actions student-view-registration-actions/);
  assert.match(css, /\.student-view-registration-actions \{[^}]*margin-left: auto/);
});

test('análise automática de progresso não cria mais um histórico paralelo', () => {
  assert.doesNotMatch(assessments, /persistProgressReview|listProgressReviewHistory|review_record/);
});
