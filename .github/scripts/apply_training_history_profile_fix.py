from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}_nao_encontrado')
    return text.replace(old, new, 1)

# API: deixa de registrar a análise de progresso como histórico da IA de treinos.
assessment_path = Path('apps/api/features/assessmentRoutes.js')
assessment = assessment_path.read_text(encoding='utf-8')
assessment = replace_once(
    assessment,
    "const { buildProgressAnalysis, carryForwardAssessments } = require('../lib/progressAnalysis');\nconst { loadTrainingIntelligence } = require('../lib/trainingIntelligence');\nconst { buildProgressReviewPayload, persistProgressReview, listProgressReviewHistory } = require('../lib/progressReviewHistory');",
    "const { buildProgressAnalysis, carryForwardAssessments } = require('../lib/progressAnalysis');\nconst { loadTrainingIntelligence } = require('../lib/trainingIntelligence');",
    'import_progress_history'
)
assessment = re.sub(
    r"\n  if \(req\.method === 'GET' && url\.pathname === '/api/assessments/analysis/history'\) \{.*?\n  \}\n",
    "\n",
    assessment,
    count=1,
    flags=re.S,
)
assessment = replace_once(
    assessment,
    """    const progressReviewPayload = buildProgressReviewPayload({
      assessments: effectiveAssessments,
      baseline: effectiveBaseline,
      goals: goals.rows,
      trainingSessions,
      analysis,
      recentAnalysis
    });
    const reviewRecord = await persistProgressReview(query, user, memberId, progressReviewPayload);
""",
    "",
    'persist_progress_history'
)
assessment = replace_once(
    assessment,
    """      analysis,
      recent_analysis: recentAnalysis,
      review_record: reviewRecord
""",
    """      analysis,
      recent_analysis: recentAnalysis
""",
    'review_record_response'
)
assessment_path.write_text(assessment, encoding='utf-8')

# API: histórico real das análises geradas no módulo Treinos.
service_path = Path('apps/api/services/trainingReviewService.js')
service = service_path.read_text(encoding='utf-8')
member_history_function = r'''
async function listMemberTrainingReviews(query, user, memberId, limit = 50) {
  if (!canGenerate(user)) throw serviceError('sem_permissao', 403);
  if (!memberId) throw serviceError('member_id_obrigatorio', 400);
  const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1', [memberId, user.gym_id]);
  if (!member.rowCount) throw serviceError('aluno_nao_encontrado', 404);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const result = await query(
    `SELECT r.id, r.member_id, r.plan_id, wp.name AS plan_name, wp.goal AS plan_goal,
            wp.level AS plan_level, wp.status AS plan_status, r.source, r.model,
            r.prompt_version, r.status, r.confidence, r.requires_human_review,
            r.recommendation AS summary, r.signals, r.suggestions, r.student_message,
            r.trainer_notes, r.error_code, r.duration_ms, r.token_usage,
            r.approved_at, r.approved_by, r.rejected_at, r.rejected_by,
            r.rejection_reason, r.created_at
     FROM workout_ai_reviews r
     INNER JOIN workout_plans wp ON wp.id = r.plan_id AND wp.gym_id = r.gym_id
     WHERE r.gym_id = $1 AND r.member_id = $2
     ORDER BY r.created_at DESC
     LIMIT $3`,
    [user.gym_id, memberId, safeLimit]
  );
  return result.rows;
}

'''
service = replace_once(
    service,
    "async function decideTrainingReview(query, user, reviewId, decision, reason = '') {",
    member_history_function + "async function decideTrainingReview(query, user, reviewId, decision, reason = '') {",
    'member_history_function'
)
service = replace_once(
    service,
    """  reviewTrainingPlan,
  listTrainingReviews,
  decideTrainingReview,
""",
    """  reviewTrainingPlan,
  listTrainingReviews,
  listMemberTrainingReviews,
  decideTrainingReview,
""",
    'member_history_export'
)
service_path.write_text(service, encoding='utf-8')

routes_path = Path('apps/api/features/trainingPlansRoutes.js')
routes = routes_path.read_text(encoding='utf-8')
routes = replace_once(
    routes,
    """  reviewTrainingPlan,
  listTrainingReviews,
  decideTrainingReview
""",
    """  reviewTrainingPlan,
  listTrainingReviews,
  listMemberTrainingReviews,
  decideTrainingReview
""",
    'member_history_import'
)
member_route = r'''  if (req.method === 'GET' && url.pathname === '/api/training/plans/reviews/member') {
    const memberId = url.searchParams.get('member_id');
    try {
      const data = await listMemberTrainingReviews(query, user, memberId, url.searchParams.get('limit'));
      return send(res, 200, { data });
    } catch (error) {
      return sendServiceError(send, res, error);
    }
  }

'''
routes = replace_once(
    routes,
    "  if (req.method === 'GET' && url.pathname === '/api/training/plans/reviews') {",
    member_route + "  if (req.method === 'GET' && url.pathname === '/api/training/plans/reviews') {",
    'member_history_route'
)
routes_path.write_text(routes, encoding='utf-8')

# HTML: ações dentro do cartão principal e textos deixando claro que o histórico vem de Treinos.
html_path = Path('apps/web/alunos.html')
html = html_path.read_text(encoding='utf-8')
old_identity = '''        <div class="student-view-identity"><div class="student-view-avatar"><img id="student-view-photo" alt="Foto do aluno" hidden /><span id="student-view-photo-empty">Sem foto</span></div><div><span class="student-view-status" id="student-view-status">Ativo</span><p>Plano atual: <strong id="student-view-plan">Sem plano ativo</strong></p><p>Metas: <strong id="student-view-goals">Carregando...</strong></p><p>Ficha: <strong id="student-view-training">Sem ficha ativa</strong></p><p>Última avaliação: <strong id="student-view-assessment-age">Nunca avaliado</strong></p></div></div>
        <div class="student-view-context-actions student-view-registration-actions"><button class="button" id="student-view-new-assessment" type="button">+ Nova avaliação</button><button class="button secondary" id="student-view-summary" type="button">Resumo comparativo</button></div>'''
new_identity = '''        <div class="student-view-identity"><div class="student-view-avatar"><img id="student-view-photo" alt="Foto do aluno" hidden /><span id="student-view-photo-empty">Sem foto</span></div><div class="student-view-identity-copy"><span class="student-view-status" id="student-view-status">Ativo</span><p>Plano atual: <strong id="student-view-plan">Sem plano ativo</strong></p><p>Metas: <strong id="student-view-goals">Carregando...</strong></p><p>Ficha: <strong id="student-view-training">Sem ficha ativa</strong></p><p>Última avaliação: <strong id="student-view-assessment-age">Nunca avaliado</strong></p></div><div class="student-view-registration-actions"><button class="button" id="student-view-new-assessment" type="button">+ Nova avaliação</button><button class="button secondary" id="student-view-summary" type="button">Resumo comparativo</button></div></div>'''
html = replace_once(html, old_identity, new_identity, 'identity_actions')
html = replace_once(
    html,
    '<h4>Histórico de análises com IA</h4><p>Cada geração fica registrada no perfil do aluno.</p>',
    '<h4>Histórico da IA de treinos</h4><p>Análises geradas na ficha do aluno pelo módulo Treinos.</p>',
    'history_copy'
)
html = replace_once(
    html,
    '<h3 id="student-ai-history-title">Histórico de análises com IA</h3>',
    '<h3 id="student-ai-history-title">Histórico da IA de treinos</h3>',
    'history_modal_title'
)
html = html.replace('product-layout.css?v=20260719-2', 'product-layout.css?v=20260720-1', 1)
html = html.replace('alunos.js?v=20260719-4', 'alunos.js?v=20260720-1', 1)
html_path.write_text(html, encoding='utf-8')

# Interface: histórico baseado em workout_ai_reviews, não na análise automática de progresso.
js_path = Path('apps/web/alunos.js')
js = js_path.read_text(encoding='utf-8')
js = replace_once(js, "if (tabName === 'history' && activeStudentView) void loadStudentAiHistory(activeStudentView.id);", "if (tabName === 'history' && activeStudentView) void loadStudentTrainingReviewHistory(activeStudentView.id);", 'history_tab_loader')
new_history_block = r'''function trainingReviewConfidencePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number <= 1 ? number * 100 : number)));
}

function trainingReviewText(value) {
  return String(value || '')
    .replace(/\bfat_loss\b/gi, 'redução de gordura')
    .replace(/\bmuscle_gain\b/gi, 'ganho de massa muscular')
    .replace(/\bprofessional_review\b/gi, 'revisão do professor')
    .replace(/\breplace_partially\b/gi, 'substituição parcial')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trainingReviewRecommendation(review) {
  if (review?.requires_human_review || review?.status === 'professional_review') return 'Solicite revisão do professor.';
  const labels = {
    maintain: 'Mantenha a ficha atual.',
    adjust: 'Ajuste a ficha com acompanhamento.',
    replace_partially: 'Revise parte da ficha.'
  };
  return labels[review?.status] || 'Acompanhe a ficha com o professor.';
}

function trainingReviewDecision(review) {
  if (review?.approved_at) return 'Aprovada pelo professor';
  if (review?.rejected_at) return 'Rejeitada pelo professor';
  return 'Aguardando decisão do professor';
}

function trainingReviewSource(review) {
  return review?.source === 'rules_fallback' ? 'Regras automáticas' : 'IA da ficha de treino';
}

function appendTrainingReviewItems(documentTarget, parent, titleText, items) {
  const cleanItems = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!cleanItems.length) return;
  const section = documentTarget.createElement('section');
  section.className = 'student-training-review-section';
  const title = documentTarget.createElement('h5');
  title.textContent = titleText;
  const list = documentTarget.createElement('div');
  list.className = 'student-training-review-items';
  cleanItems.forEach((item) => {
    const card = documentTarget.createElement('article');
    const heading = documentTarget.createElement('strong');
    const copy = documentTarget.createElement('p');
    if (typeof item === 'string') {
      heading.textContent = trainingReviewText(item);
    } else {
      heading.textContent = trainingReviewText(item.suggested_action || item.description || item.type || 'Registro');
      copy.textContent = trainingReviewText(item.reason || (Array.isArray(item.evidence) ? item.evidence.join(' · ') : ''));
    }
    card.appendChild(heading);
    if (copy.textContent) card.appendChild(copy);
    list.appendChild(card);
  });
  section.append(title, list);
  parent.appendChild(section);
}

function studentTrainingReviewHistoryEntry(review) {
  const details = document.createElement('details');
  details.className = 'student-ai-history-entry student-training-review-entry';
  const summary = document.createElement('summary');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = review.plan_name ? `Ficha: ${review.plan_name}` : 'Análise da ficha de treino';
  const meta = document.createElement('span');
  const date = review.created_at ? new Date(review.created_at).toLocaleString('pt-BR') : 'Data não informada';
  meta.textContent = `${date} · ${trainingReviewConfidencePercent(review.confidence)}% de confiabilidade · ${trainingReviewSource(review)}`;
  copy.append(title, meta);
  const indicator = document.createElement('span');
  indicator.className = 'student-ai-history-toggle';
  indicator.textContent = 'Ver análise';
  summary.append(copy, indicator);

  const body = document.createElement('div');
  body.className = 'student-ai-history-body student-training-review-body';
  const overview = document.createElement('div');
  overview.className = 'student-training-review-overview';
  [
    ['Recomendação', trainingReviewRecommendation(review)],
    ['Confiabilidade', `${trainingReviewConfidencePercent(review.confidence)}%`],
    ['Situação', trainingReviewDecision(review)]
  ].forEach(([label, value]) => {
    const card = document.createElement('article');
    const name = document.createElement('span'); name.textContent = label;
    const content = document.createElement('strong'); content.textContent = value;
    card.append(name, content); overview.appendChild(card);
  });
  body.appendChild(overview);

  const summaryText = trainingReviewText(review.summary);
  if (summaryText) {
    const summaryCard = document.createElement('p');
    summaryCard.className = 'student-training-review-summary';
    summaryCard.textContent = summaryText;
    body.appendChild(summaryCard);
  }
  appendTrainingReviewItems(document, body, 'Pontos identificados', review.signals);
  appendTrainingReviewItems(document, body, 'Próximos passos', review.suggestions);

  const messages = [];
  if (review.student_message) messages.push({ description: 'Mensagem para o aluno', evidence: [review.student_message] });
  if (review.trainer_notes) messages.push({ description: 'Observação profissional', evidence: [review.trainer_notes] });
  if (review.rejection_reason) messages.push({ description: 'Motivo da rejeição', evidence: [review.rejection_reason] });
  appendTrainingReviewItems(document, body, 'Mensagens registradas', messages);

  details.append(summary, body);
  details.addEventListener('toggle', () => {
    indicator.textContent = details.open ? 'Ocultar análise' : 'Ver análise';
    if (!details.open) return;
    details.parentElement?.querySelectorAll('details[open]').forEach((item) => {
      if (item !== details) item.removeAttribute('open');
    });
  });
  return details;
}

function renderStudentTrainingReviewHistory(rows, target) {
  if (!target) return;
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma análise gerada na aba Treinos para este aluno.';
    target.appendChild(empty);
    return;
  }
  rows.forEach((review) => target.appendChild(studentTrainingReviewHistoryEntry(review)));
}

async function loadStudentTrainingReviewHistory(memberId = activeStudentView?.id) {
  if (!memberId || studentAiHistoryLoading) return;
  studentAiHistoryLoading = true;
  const profileStatus = $('student-view-ai-history-status');
  const modalStatus = $('student-ai-history-modal-status');
  if (profileStatus) profileStatus.textContent = 'Carregando análises da ficha...';
  if (modalStatus && !$('student-ai-history-modal').classList.contains('hidden')) modalStatus.textContent = 'Carregando análises da ficha...';
  try {
    const result = await req(`/api/training/plans/reviews/member?member_id=${encodeURIComponent(memberId)}&limit=50`);
    if (String(activeStudentView?.id || '') !== String(memberId)) return;
    const records = Array.isArray(result.data) ? result.data : [];
    renderStudentTrainingReviewHistory(records, $('student-view-ai-history-list'));
    renderStudentTrainingReviewHistory(records, $('student-ai-history-modal-list'));
    if (profileStatus) profileStatus.textContent = '';
    if (modalStatus) modalStatus.textContent = '';
  } catch (error) {
    const message = `Não foi possível carregar as análises da ficha: ${error.message}`;
    if (profileStatus) profileStatus.textContent = message;
    if (modalStatus) modalStatus.textContent = message;
  } finally {
    studentAiHistoryLoading = false;
  }
}

function openStudentAiHistoryModal() {
  if (!activeStudentView) return;
  $('student-ai-history-member-name').textContent = activeStudentView.name || 'Aluno';
  setStudentContextModal('student-ai-history-modal', true);
  void loadStudentTrainingReviewHistory(activeStudentView.id);
}

'''
js, count = re.subn(
    r"function studentAiHistoryEntry\(review\) \{.*?\n\}\n\nasync function loadStudentAi\(memberId",
    new_history_block + "async function loadStudentAi(memberId",
    js,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('history_block_nao_encontrado')
js = js.replace("    void loadStudentAiHistory(memberId);\n", "", 1)
js = js.replace("$('student-view-ai-history-list').innerHTML = '<div class=\"empty-state\">Carregando análises...</div>';", "$('student-view-ai-history-list').innerHTML = '<div class=\"empty-state\">Carregando análises da ficha...</div>';", 1)
js_path.write_text(js, encoding='utf-8')

# CSS: elimina o bloco vazio e coloca as ações no canto do cartão principal.
css_path = Path('apps/web/product-layout.css')
css = css_path.read_text(encoding='utf-8')
css += r'''

/* Perfil do aluno: ações dentro do cartão e histórico real da IA de treinos. */
.student-view-identity { align-items: center; flex-wrap: wrap; }
.student-view-identity-copy { flex: 1 1 320px; min-width: 0; }
.student-view-registration-actions { display: flex; align-self: flex-start; gap: 8px; margin-left: auto; }
.student-view-registration-actions .button { width: auto; min-height: 36px; padding: 8px 12px; font-size: 12px; white-space: nowrap; }
.student-training-review-entry > summary { align-items: center; }
.student-training-review-entry > summary > div { display: grid; gap: 4px; min-width: 0; }
.student-training-review-entry > summary span { color: var(--muted); font-size: 11px; }
.student-training-review-body { display: grid; gap: 14px; }
.student-training-review-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.student-training-review-overview article { display: grid; gap: 5px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.student-training-review-overview span { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.student-training-review-overview strong { font-size: 13px; line-height: 1.35; }
.student-training-review-summary { margin: 0; padding: 12px 14px; border-left: 3px solid var(--accent); border-radius: 8px; background: color-mix(in srgb, var(--accent) 8%, transparent); line-height: 1.5; }
.student-training-review-section { display: grid; gap: 8px; }
.student-training-review-section h5 { margin: 0; font-size: 13px; }
.student-training-review-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.student-training-review-items article { display: grid; gap: 4px; padding: 11px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
.student-training-review-items strong { font-size: 12px; }
.student-training-review-items p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
@media (max-width: 760px) {
  .student-view-registration-actions { width: 100%; margin-left: 0; }
  .student-view-registration-actions .button { flex: 1 1 0; }
  .student-training-review-overview, .student-training-review-items { grid-template-columns: 1fr; }
}
'''
css_path.write_text(css, encoding='utf-8')

# Testes de regressão para o requisito corrigido.
test_path = Path('apps/api/test/studentAiProfileHistoryUi.test.js')
test_path.write_text(r'''const test = require('node:test');
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
''', encoding='utf-8')
