from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}_nao_encontrado')
    return text.replace(old, new, 1)

# API routes
path = Path('apps/api/features/assessmentRoutes.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "const { loadTrainingIntelligence } = require('../lib/trainingIntelligence');\n",
    "const { loadTrainingIntelligence } = require('../lib/trainingIntelligence');\nconst { buildProgressReviewPayload, persistProgressReview, listProgressReviewHistory } = require('../lib/progressReviewHistory');\n",
    'import_history'
)

analysis_marker = """  if (req.method === 'GET' && url.pathname === '/api/assessments/analysis') {
"""
history_route = """  if (req.method === 'GET' && url.pathname === '/api/assessments/analysis/history') {
    const memberId = url.searchParams.get('member_id');
    if (!memberId) return send(res, 400, { error: 'member_id_obrigatorio' });
    const member = await query('SELECT id FROM members WHERE id = $1 AND gym_id = $2 LIMIT 1', [memberId, user.gym_id]);
    if (!member.rowCount) return send(res, 404, { error: 'aluno_nao_encontrado' });
    const data = await listProgressReviewHistory(query, user.gym_id, memberId, url.searchParams.get('limit'));
    return send(res, 200, { data });
  }

  if (req.method === 'GET' && url.pathname === '/api/assessments/analysis') {
"""
text = replace_once(text, analysis_marker, history_route, 'history_route')

old_return = """    const hasProgress = effectiveAssessments[0] && effectiveBaseline && effectiveAssessments[0].id !== effectiveBaseline.id;
    const trainingIntelligence = await loadTrainingIntelligence(query, user.gym_id, memberId, { assessments: effectiveAssessments, goals: goals.rows });
    return send(res, 200, {
      assessments: effectiveAssessments,
      baseline: effectiveBaseline,
      goals: goals.rows,
      training_sessions: trainingSessions,
      training_intelligence: trainingIntelligence,
      analysis: buildProgressAnalysis(effectiveAssessments[0], hasProgress ? effectiveBaseline : null, goals.rows, { comparisonLabel: 'medição inicial', includeProjection: false }),
      recent_analysis: buildProgressAnalysis(effectiveAssessments[0], effectiveAssessments[1] || null, goals.rows, { comparisonLabel: 'avaliação anterior', includeProjection: false, trainingSessions })
    });
"""
new_return = """    const hasProgress = effectiveAssessments[0] && effectiveBaseline && effectiveAssessments[0].id !== effectiveBaseline.id;
    const trainingIntelligence = await loadTrainingIntelligence(query, user.gym_id, memberId, { assessments: effectiveAssessments, goals: goals.rows });
    const analysis = buildProgressAnalysis(effectiveAssessments[0], hasProgress ? effectiveBaseline : null, goals.rows, { comparisonLabel: 'medição inicial', includeProjection: false });
    const recentAnalysis = buildProgressAnalysis(effectiveAssessments[0], effectiveAssessments[1] || null, goals.rows, { comparisonLabel: 'avaliação anterior', includeProjection: false, trainingSessions });
    const progressReviewPayload = buildProgressReviewPayload({
      assessments: effectiveAssessments,
      baseline: effectiveBaseline,
      goals: goals.rows,
      trainingSessions,
      analysis,
      recentAnalysis
    });
    const reviewRecord = await persistProgressReview(query, user, memberId, progressReviewPayload);
    return send(res, 200, {
      assessments: effectiveAssessments,
      baseline: effectiveBaseline,
      goals: goals.rows,
      training_sessions: trainingSessions,
      training_intelligence: trainingIntelligence,
      analysis,
      recent_analysis: recentAnalysis,
      review_record: reviewRecord
    });
"""
text = replace_once(text, old_return, new_return, 'analysis_persistence')
path.write_text(text, encoding='utf-8')

# HTML
path = Path('apps/web/alunos.html')
text = path.read_text(encoding='utf-8')
text = text.replace('product-layout.css?v=20260719-1', 'product-layout.css?v=20260719-2', 1)
old_registration = """      <div class="student-view-tab-panel" id="student-view-tab-registration" role="tabpanel" data-student-view-panel="registration">
        <div class="student-view-context-actions"><button class="button" id="student-view-new-assessment" type="button">+ Nova avaliação</button><button class="button secondary" id="student-view-summary" type="button">Resumo comparativo</button></div>
        <div class="student-view-identity"><div class="student-view-avatar"><img id="student-view-photo" alt="Foto do aluno" hidden /><span id="student-view-photo-empty">Sem foto</span></div><div><span class="student-view-status" id="student-view-status">Ativo</span><p>Plano atual: <strong id="student-view-plan">Sem plano ativo</strong></p><p>Metas: <strong id="student-view-goals">Carregando...</strong></p><p>Ficha: <strong id="student-view-training">Sem ficha ativa</strong></p><p>Última avaliação: <strong id="student-view-assessment-age">Nunca avaliado</strong></p></div></div>
"""
new_registration = """      <div class="student-view-tab-panel" id="student-view-tab-registration" role="tabpanel" data-student-view-panel="registration">
        <div class="student-view-identity"><div class="student-view-avatar"><img id="student-view-photo" alt="Foto do aluno" hidden /><span id="student-view-photo-empty">Sem foto</span></div><div><span class="student-view-status" id="student-view-status">Ativo</span><p>Plano atual: <strong id="student-view-plan">Sem plano ativo</strong></p><p>Metas: <strong id="student-view-goals">Carregando...</strong></p><p>Ficha: <strong id="student-view-training">Sem ficha ativa</strong></p><p>Última avaliação: <strong id="student-view-assessment-age">Nunca avaliado</strong></p></div></div>
        <div class="student-view-context-actions student-view-registration-actions"><button class="button" id="student-view-new-assessment" type="button">+ Nova avaliação</button><button class="button secondary" id="student-view-summary" type="button">Resumo comparativo</button></div>
"""
text = replace_once(text, old_registration, new_registration, 'registration_actions')
old_tabs = """      <div class="student-view-tab-panel hidden" id="student-view-tab-history" role="tabpanel" data-student-view-panel="history"><ul class="student-view-tab-list" id="student-view-assessments"></ul></div>
      <div class="student-view-tab-panel hidden" id="student-view-tab-media" role="tabpanel" data-student-view-panel="media"><div class="student-view-media-grid" id="student-view-media"></div></div>
      <div class="student-view-tab-panel hidden" id="student-view-tab-ai" role="tabpanel" data-student-view-panel="ai"><p class="status-line" id="student-view-ai-status" aria-live="polite"></p><div id="student-view-ai-content"></div></div>
"""
new_tabs = """      <div class="student-view-tab-panel hidden" id="student-view-tab-history" role="tabpanel" data-student-view-panel="history"><div class="student-view-tab-toolbar"><div><h4>Histórico de análises com IA</h4><p>Cada geração fica registrada no perfil do aluno.</p></div></div><p class="status-line" id="student-view-ai-history-status" aria-live="polite"></p><div class="student-ai-history-list" id="student-view-ai-history-list"></div></div>
      <div class="student-view-tab-panel hidden" id="student-view-tab-media" role="tabpanel" data-student-view-panel="media"><div class="student-view-media-grid" id="student-view-media"></div></div>
      <div class="student-view-tab-panel hidden" id="student-view-tab-ai" role="tabpanel" data-student-view-panel="ai"><div class="student-view-tab-toolbar student-ai-tab-toolbar"><div><h4>Análise atual</h4><p>Indicadores calculados com os dados mais recentes do aluno.</p></div><button class="button secondary" id="student-view-ai-history-button" type="button">Histórico de registros</button></div><p class="status-line" id="student-view-ai-status" aria-live="polite"></p><div id="student-view-ai-content"></div></div>
"""
text = replace_once(text, old_tabs, new_tabs, 'student_tabs')
summary_modal = """  <div class="modal hidden student-context-modal" id="student-summary-modal" role="dialog" aria-modal="true" aria-labelledby="student-summary-title" aria-hidden="true"><section class="modal-card student-context-modal-card"><div class="modal-header"><div><h3 id="student-summary-title">Resumo comparativo</h3><p id="student-summary-member-name">Aluno</p></div><button class="secondary modal-close" id="close-student-summary-modal" type="button" aria-label="Fechar">×</button></div><p class="status-line" id="student-summary-status" aria-live="polite"></p><ul class="summary-results" id="student-summary-list"></ul></section></div>
"""
history_modal = summary_modal + """
  <div class="modal hidden student-context-modal" id="student-ai-history-modal" role="dialog" aria-modal="true" aria-labelledby="student-ai-history-title" aria-hidden="true"><section class="modal-card student-context-modal-card student-ai-history-modal-card"><div class="modal-header"><div><h3 id="student-ai-history-title">Histórico de análises com IA</h3><p id="student-ai-history-member-name">Aluno</p></div><button class="secondary modal-close" id="close-student-ai-history-modal" type="button" aria-label="Fechar">×</button></div><p class="status-line" id="student-ai-history-modal-status" aria-live="polite"></p><div class="student-ai-history-list" id="student-ai-history-modal-list"></div></section></div>
"""
text = replace_once(text, summary_modal, history_modal, 'history_modal')
text = text.replace('alunos.js?v=20260719-3', 'alunos.js?v=20260719-4', 1)
path.write_text(text, encoding='utf-8')

# JavaScript
path = Path('apps/web/alunos.js')
text = path.read_text(encoding='utf-8')
text = replace_once(text, "let studentAiLoading = false;\n", "let studentAiLoading = false;\nlet studentAiHistoryLoading = false;\n", 'history_state')
old_tab = """  if (tabName === 'ai' && activeStudentView) {
    void loadStudentAi(activeStudentView.id);
    studentAiRefreshTimer = setInterval(() => {
      if (!document.hidden && !$('student-view-modal').classList.contains('hidden')) void loadStudentAi(activeStudentView?.id);
    }, 30000);
  }
"""
new_tab = """  if (tabName === 'history' && activeStudentView) void loadStudentAiHistory(activeStudentView.id);
  if (tabName === 'ai' && activeStudentView) {
    void loadStudentAi(activeStudentView.id);
    studentAiRefreshTimer = setInterval(() => {
      if (!document.hidden && !$('student-view-modal').classList.contains('hidden')) void loadStudentAi(activeStudentView?.id);
    }, 30000);
  }
"""
text = replace_once(text, old_tab, new_tab, 'history_tab_loading')
text = text.replace("    setStudentViewTab('history');", "    setStudentViewTab('ai');", 1)
text = replace_once(text, "function renderStudentAi(result) {\n  const host = $('student-view-ai-content');\n", "function renderStudentAi(result, host = $('student-view-ai-content')) {\n", 'render_target')
old_facts = """  const factItems = [
    ['Avaliações', result.assessments?.length || 0],
    ['Treinos no período', result.training_sessions || 0],
    ['Metas ativas', (result.goals || []).filter((goal) => !['completed', 'closed'].includes(goal.status)).length]
  ];
"""
new_facts = """  const factItems = [
    ['Avaliações', result.assessment_count ?? result.assessments?.length ?? 0],
    ['Treinos no período', result.training_sessions || 0],
    ['Metas ativas', result.active_goal_count ?? (result.goals || []).filter((goal) => !['completed', 'closed'].includes(goal.status)).length]
  ];
"""
text = replace_once(text, old_facts, new_facts, 'history_fact_counts')

load_marker = """async function loadStudentAi(memberId = activeStudentView?.id) {
"""
history_functions = """function studentAiHistoryEntry(review) {
  const details = document.createElement('details');
  details.className = 'student-ai-history-entry';
  const summary = document.createElement('summary');
  const copy = document.createElement('div');
  const analysis = review.recent_analysis || review.analysis || {};
  const title = document.createElement('strong');
  title.textContent = analysis.title || 'Análise do progresso';
  const meta = document.createElement('span');
  const date = review.created_at ? new Date(review.created_at).toLocaleString('pt-BR') : 'Data não informada';
  meta.textContent = `${date} · ${review.assessment_count || 0} avaliação(ões) · ${review.training_sessions || 0} treino(s)`;
  copy.append(title, meta);
  const indicator = document.createElement('span');
  indicator.className = 'student-ai-history-toggle';
  indicator.textContent = 'Ver detalhes';
  summary.append(copy, indicator);
  const body = document.createElement('div');
  body.className = 'student-ai-history-body';
  renderStudentAi(review, body);
  details.append(summary, body);
  details.addEventListener('toggle', () => {
    indicator.textContent = details.open ? 'Ocultar detalhes' : 'Ver detalhes';
    if (!details.open) return;
    details.parentElement?.querySelectorAll('details[open]').forEach((item) => {
      if (item !== details) item.removeAttribute('open');
    });
  });
  return details;
}

function renderStudentAiHistory(rows, target) {
  if (!target) return;
  target.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma análise com IA registrada para este aluno.';
    target.appendChild(empty);
    return;
  }
  rows.forEach((review) => target.appendChild(studentAiHistoryEntry(review)));
}

async function loadStudentAiHistory(memberId = activeStudentView?.id) {
  if (!memberId || studentAiHistoryLoading) return;
  studentAiHistoryLoading = true;
  const profileStatus = $('student-view-ai-history-status');
  const modalStatus = $('student-ai-history-modal-status');
  if (profileStatus) profileStatus.textContent = 'Carregando histórico...';
  if (modalStatus && !$('student-ai-history-modal').classList.contains('hidden')) modalStatus.textContent = 'Carregando histórico...';
  try {
    const result = await req(`/api/assessments/analysis/history?member_id=${encodeURIComponent(memberId)}&limit=50`);
    if (String(activeStudentView?.id || '') !== String(memberId)) return;
    const records = Array.isArray(result.data) ? result.data : [];
    renderStudentAiHistory(records, $('student-view-ai-history-list'));
    renderStudentAiHistory(records, $('student-ai-history-modal-list'));
    if (profileStatus) profileStatus.textContent = '';
    if (modalStatus) modalStatus.textContent = '';
  } catch (error) {
    const message = `Não foi possível carregar o histórico: ${error.message}`;
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
  void loadStudentAiHistory(activeStudentView.id);
}

async function loadStudentAi(memberId = activeStudentView?.id) {
"""
text = replace_once(text, load_marker, history_functions, 'history_functions')
text = replace_once(text, "    renderStudentAi(result);\n", "    renderStudentAi(result);\n    void loadStudentAiHistory(memberId);\n", 'refresh_history_after_analysis')
text = text.replace("  $('student-view-assessments').innerHTML = '<li class=\"empty-state\">Carregando avaliações...</li>';", "  $('student-view-ai-history-list').innerHTML = '<div class=\"empty-state\">Carregando análises...</div>';", 1)
old_assessments_render = """    const list = $('student-view-assessments');
    list.innerHTML = '';
    const assessments = assessmentResult.data || [];
    const latestAssessment = assessments[0];
    $('student-view-assessment-age').textContent = latestAssessment?.assessment_date ? `${dateOnly(latestAssessment.assessment_date)} · ${assessmentAge(latestAssessment.assessment_date)}` : 'Nunca avaliado';
    for (const assessment of assessments.slice(0, 8)) {
      const row = document.createElement('li');
      row.className = 'student-view-assessment-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `Avaliação em ${new Date(`${String(assessment.assessment_date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}`;
      const summary = document.createElement('span');
      summary.textContent = `Peso: ${assessment.weight_kg ?? '-'} kg · Gordura: ${assessment.body_fat_percent ?? '-'}% · Cintura: ${assessment.waist_cm ?? '-'} cm`;
      copy.append(title, summary);
      row.appendChild(copy);
      if (assessment.photo_url) { const image = document.createElement('img'); image.src = assessment.photo_url; image.alt = ''; image.loading = 'lazy'; row.appendChild(image); }
      list.appendChild(row);
    }
    if (!list.children.length) list.innerHTML = '<li class="empty-state">Nenhuma avaliação registrada.</li>';
"""
new_assessments_render = """    const assessments = assessmentResult.data || [];
    const latestAssessment = assessments[0];
    $('student-view-assessment-age').textContent = latestAssessment?.assessment_date ? `${dateOnly(latestAssessment.assessment_date)} · ${assessmentAge(latestAssessment.assessment_date)}` : 'Nunca avaliado';
"""
text = replace_once(text, old_assessments_render, new_assessments_render, 'replace_physical_history')
text = text.replace("    $('student-view-assessments').innerHTML = `<li class=\"empty-state\">Não foi possível carregar o histórico: ${error.message}</li>`;", "    $('student-view-ai-history-status').textContent = `Não foi possível carregar o histórico: ${error.message}`;", 1)
listeners_old = """$('student-view-new-assessment').onclick = openStudentAssessmentModal;
$('student-view-summary').onclick = openStudentSummary;
$('student-view-new-goal').onclick = openStudentGoalModal;
"""
listeners_new = """$('student-view-new-assessment').onclick = openStudentAssessmentModal;
$('student-view-summary').onclick = openStudentSummary;
$('student-view-ai-history-button').onclick = openStudentAiHistoryModal;
$('student-view-new-goal').onclick = openStudentGoalModal;
"""
text = replace_once(text, listeners_old, listeners_new, 'history_button_listener')
text = replace_once(text, "$('close-student-summary-modal').onclick = () => setStudentContextModal('student-summary-modal', false);\n", "$('close-student-summary-modal').onclick = () => setStudentContextModal('student-summary-modal', false);\n$('close-student-ai-history-modal').onclick = () => setStudentContextModal('student-ai-history-modal', false);\n", 'history_modal_close')
text = replace_once(text, "for (const id of ['student-assessment-modal', 'student-goal-modal', 'student-summary-modal'])", "for (const id of ['student-assessment-modal', 'student-goal-modal', 'student-summary-modal', 'student-ai-history-modal'])", 'modal_backdrop')
path.write_text(text, encoding='utf-8')

# CSS
path = Path('apps/web/product-layout.css')
text = path.read_text(encoding='utf-8')
text += """

/* Histórico persistente da IA no perfil do aluno. */
.student-view-registration-actions {
  margin: 12px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface, #f4f8fc);
}

.student-ai-tab-toolbar .button {
  width: auto;
  flex: 0 0 auto;
}

.student-ai-history-modal-card {
  width: min(920px, 96vw);
}

.student-ai-history-list {
  display: grid;
  gap: 10px;
}

.student-ai-history-entry {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
}

.student-ai-history-entry > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  cursor: pointer;
  list-style: none;
}

.student-ai-history-entry > summary::-webkit-details-marker { display: none; }
.student-ai-history-entry > summary > div { display: grid; gap: 4px; min-width: 0; }
.student-ai-history-entry > summary strong { color: var(--text); font-size: 14px; }
.student-ai-history-entry > summary span { color: var(--muted); font-size: 11px; }
.student-ai-history-entry .student-ai-history-toggle { color: var(--accent); font-weight: 800; white-space: nowrap; }
.student-ai-history-entry[open] > summary { border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.student-ai-history-body { padding: 14px; }
.student-ai-history-body .student-admin-ai-facts { margin-top: 0; }

@media (max-width: 640px) {
  .student-ai-tab-toolbar { align-items: stretch; flex-direction: column; }
  .student-ai-tab-toolbar .button { width: 100%; }
  .student-ai-history-entry > summary { align-items: flex-start; flex-direction: column; }
}
"""
path.write_text(text, encoding='utf-8')
