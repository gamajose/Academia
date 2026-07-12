const assessmentHost = window.location.hostname || 'localhost';
const ASSESSMENT_API = localStorage.getItem('apiBaseUrl') || `http://${assessmentHost}:3004`;
const ASSESSMENT_TOKEN = localStorage.getItem('academiaToken') || '';
const ASSESSMENT_REFRESH_MS = 5000;
const q = (id) => document.getElementById(id);
let assessmentsRefreshTimer = null;
let assessmentsRequestInFlight = false;
let goalsRequestInFlight = false;
let lastAssessmentsSignature = '';
let lastGoalsSignature = '';

function setAssessmentStatus(text) {
  const target = q('assessment-status');
  if (target) target.textContent = text;
}

function setModalStatus(id, text) {
  const target = q(id);
  if (target) target.textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(`${ASSESSMENT_API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ASSESSMENT_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function fillSelect(id, members) {
  const select = q(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Selecione o aluno</option>';
  for (const member of members) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    option.selected = member.id === current;
    select.appendChild(option);
  }
}

function value(id) {
  return q(id)?.value || '';
}

function formatDate(valueToFormat) {
  if (!valueToFormat) return '-';
  const date = new Date(`${String(valueToFormat).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(valueToFormat);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatNumber(valueToFormat, suffix = '') {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return '-';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(valueToFormat))}${suffix}`;
}

function openModal(id, focusId = '') {
  const modal = q(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  if (focusId) requestAnimationFrame(() => q(focusId)?.focus());
}

function closeModal(id) {
  const modal = q(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal:not(.hidden)')) document.body.classList.remove('modal-open');
}

function resetAssessmentForm() {
  q('assessment-form')?.reset();
  q('assessment-date').value = new Date().toISOString().slice(0, 10);
  setModalStatus('assessment-form-status', '');
}

function resetGoalForm() {
  q('goal-form')?.reset();
  setModalStatus('goal-form-status', '');
}

function openAssessmentModal() {
  resetAssessmentForm();
  openModal('assessment-modal', 'assessment-member');
}

function openGoalModal() {
  resetGoalForm();
  openModal('goal-modal', 'goal-member');
}

function openSummaryModal() {
  q('summary-list').innerHTML = '';
  setModalStatus('summary-status', '');
  openModal('summary-modal', 'summary-member');
}

function renderAssessments(rows) {
  const list = q('assessment-list');
  if (!list) return;
  list.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma avaliação registrada.';
    list.appendChild(empty);
    return;
  }

  for (const item of rows) {
    const row = document.createElement('li');
    row.className = 'workflow-record';

    const main = document.createElement('div');
    main.className = 'workflow-record-main';
    const title = document.createElement('strong');
    title.textContent = item.member_name || 'Aluno';
    const date = document.createElement('span');
    date.textContent = `Avaliação em ${formatDate(item.assessment_date)}`;
    const metrics = document.createElement('small');
    metrics.textContent = `Peso: ${formatNumber(item.weight_kg, ' kg')} · Gordura: ${formatNumber(item.body_fat_percent, '%')} · Cintura: ${formatNumber(item.waist_cm, ' cm')}`;
    main.append(title, date, metrics);

    row.appendChild(main);
    list.appendChild(row);
  }
}

function renderGoals(rows) {
  const list = q('goal-list');
  if (!list) return;
  list.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma meta cadastrada.';
    list.appendChild(empty);
    return;
  }

  for (const item of rows) {
    const row = document.createElement('li');
    row.className = 'workflow-record';

    const main = document.createElement('div');
    main.className = 'workflow-record-main';
    const title = document.createElement('strong');
    title.textContent = `${item.member_name || 'Aluno'} · ${item.goal_type || 'Meta'}`;
    const target = document.createElement('span');
    target.textContent = `Alvo: ${formatNumber(item.target_value)} · Data: ${formatDate(item.target_date)}`;
    const status = document.createElement('small');
    status.textContent = `Status: ${item.status || 'aberta'}`;
    main.append(title, target, status);

    row.appendChild(main);
    list.appendChild(row);
  }
}

function assessmentsSignature(rows) {
  return JSON.stringify(rows.map((item) => [
    item.id,
    item.assessment_date,
    item.member_name,
    item.weight_kg,
    item.body_fat_percent,
    item.waist_cm
  ]));
}

function goalsSignature(rows) {
  return JSON.stringify(rows.map((item) => [
    item.id,
    item.member_name,
    item.goal_type,
    item.target_value,
    item.target_date,
    item.status
  ]));
}

async function loadAssessments({ force = false } = {}) {
  if (assessmentsRequestInFlight) return;
  assessmentsRequestInFlight = true;
  try {
    const result = await api('/api/assessments');
    const rows = result.data || [];
    const signature = assessmentsSignature(rows);
    if (force || signature !== lastAssessmentsSignature) {
      renderAssessments(rows);
      lastAssessmentsSignature = signature;
    }
  } finally {
    assessmentsRequestInFlight = false;
  }
}

async function loadGoals({ force = false } = {}) {
  if (goalsRequestInFlight) return;
  goalsRequestInFlight = true;
  try {
    const result = await api('/api/goals');
    const rows = result.data || [];
    const signature = goalsSignature(rows);
    if (force || signature !== lastGoalsSignature) {
      renderGoals(rows);
      lastGoalsSignature = signature;
    }
  } finally {
    goalsRequestInFlight = false;
  }
}

async function loadBase() {
  if (!ASSESSMENT_TOKEN) {
    setAssessmentStatus('Entre no painel principal antes de acessar avaliações.');
    return;
  }
  const membersResult = await api('/api/members');
  const members = (membersResult.data || []).filter((member) => member.status === 'active');
  fillSelect('assessment-member', members);
  fillSelect('goal-member', members);
  fillSelect('summary-member', members);
  await Promise.all([loadAssessments({ force: true }), loadGoals({ force: true })]);
  setAssessmentStatus('');
}

async function createAssessment(event) {
  event.preventDefault();
  const saveButton = q('create-assessment-button');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  setModalStatus('assessment-form-status', '');
  try {
    await api('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('assessment-member'),
        assessment_date: value('assessment-date') || null,
        weight_kg: value('weight-kg'),
        height_cm: value('height-cm'),
        body_fat_percent: value('body-fat'),
        muscle_mass_kg: value('muscle-mass'),
        waist_cm: value('waist-cm'),
        chest_cm: value('chest-cm'),
        hip_cm: value('hip-cm'),
        photo_url: value('photo-url'),
        notes: value('assessment-notes')
      })
    });
    closeModal('assessment-modal');
    setAssessmentStatus('Avaliação salva.');
    await loadAssessments({ force: true });
  } catch (error) {
    setModalStatus('assessment-form-status', `Erro: ${error.message}`);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salvar avaliação';
  }
}

async function createGoal(event) {
  event.preventDefault();
  const saveButton = q('create-goal-button');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  setModalStatus('goal-form-status', '');
  try {
    await api('/api/goals', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('goal-member'),
        goal_type: value('goal-type'),
        target_value: value('goal-value'),
        target_date: value('goal-date') || null,
        notes: value('goal-notes')
      })
    });
    closeModal('goal-modal');
    setAssessmentStatus('Meta salva.');
    await loadGoals({ force: true });
  } catch (error) {
    setModalStatus('goal-form-status', `Erro: ${error.message}`);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salvar meta';
  }
}

async function loadSummary() {
  const memberId = value('summary-member');
  const list = q('summary-list');
  list.innerHTML = '';
  setModalStatus('summary-status', '');

  if (!memberId) {
    setModalStatus('summary-status', 'Selecione um aluno para o resumo.');
    return;
  }

  const button = q('load-summary-button');
  button.disabled = true;
  button.textContent = 'Carregando...';
  try {
    const result = await api(`/api/assessments/summary?member_id=${encodeURIComponent(memberId)}`);
    if (!result.current) {
      setModalStatus('summary-status', 'Nenhuma avaliação encontrada para este aluno.');
      return;
    }

    const items = [
      `Avaliação atual: ${formatDate(result.current.assessment_date)}`,
      `Peso atual: ${formatNumber(result.current.weight_kg, ' kg')}`,
      `Gordura atual: ${formatNumber(result.current.body_fat_percent, '%')}`,
      `Massa muscular: ${formatNumber(result.current.muscle_mass_kg, ' kg')}`,
      `Variação de peso: ${formatNumber(result.delta?.weight_kg, ' kg')}`,
      `Variação de gordura: ${formatNumber(result.delta?.body_fat_percent, '%')}`,
      `Variação de cintura: ${formatNumber(result.delta?.waist_cm, ' cm')}`
    ];

    for (const item of items) {
      const row = document.createElement('li');
      row.textContent = item;
      list.appendChild(row);
    }
  } catch (error) {
    setModalStatus('summary-status', `Erro: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Carregar resumo';
  }
}

function startRealtimeUpdates() {
  if (assessmentsRefreshTimer) window.clearInterval(assessmentsRefreshTimer);
  assessmentsRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void loadAssessments().catch((error) => setAssessmentStatus(`Erro: ${error.message}`));
      void loadGoals().catch((error) => setAssessmentStatus(`Erro: ${error.message}`));
    }
  }, ASSESSMENT_REFRESH_MS);

  const refreshVisibleData = () => {
    if (document.visibilityState !== 'visible') return;
    void loadAssessments().catch((error) => setAssessmentStatus(`Erro: ${error.message}`));
    void loadGoals().catch((error) => setAssessmentStatus(`Erro: ${error.message}`));
  };
  window.addEventListener('focus', refreshVisibleData);
  document.addEventListener('visibilitychange', refreshVisibleData);
  window.addEventListener('pagehide', () => {
    if (assessmentsRefreshTimer) window.clearInterval(assessmentsRefreshTimer);
  });
}

function bindAssessmentEvents() {
  q('open-assessment-modal')?.addEventListener('click', openAssessmentModal);
  q('open-goal-modal')?.addEventListener('click', openGoalModal);
  q('open-summary-modal')?.addEventListener('click', openSummaryModal);

  q('assessment-form')?.addEventListener('submit', createAssessment);
  q('goal-form')?.addEventListener('submit', createGoal);
  q('load-summary-button')?.addEventListener('click', loadSummary);

  q('close-assessment-modal')?.addEventListener('click', () => closeModal('assessment-modal'));
  q('cancel-assessment-modal')?.addEventListener('click', () => closeModal('assessment-modal'));
  q('close-goal-modal')?.addEventListener('click', () => closeModal('goal-modal'));
  q('cancel-goal-modal')?.addEventListener('click', () => closeModal('goal-modal'));
  q('close-summary-modal')?.addEventListener('click', () => closeModal('summary-modal'));
  q('cancel-summary-modal')?.addEventListener('click', () => closeModal('summary-modal'));

  for (const modalId of ['assessment-modal', 'goal-modal', 'summary-modal']) {
    q(modalId)?.addEventListener('click', (event) => {
      if (event.target === q(modalId)) closeModal(modalId);
    });
  }
}

async function initAssessmentsPage() {
  bindAssessmentEvents();
  try {
    await loadBase();
    startRealtimeUpdates();
  } catch (error) {
    setAssessmentStatus(`Erro: ${error.message}`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAssessmentsPage, { once: true });
} else {
  void initAssessmentsPage();
}
