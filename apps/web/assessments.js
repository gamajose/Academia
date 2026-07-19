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
let currentAssessments = [];
let currentGoals = [];
let assessmentFilterPlaceholder = null;
let editingAssessmentId = '';
let editingGoalId = '';
let preservedAssessmentPhoto = '';
const ASSESSMENT_PAGE_SIZE = 5;
let assessmentPage = 1;
let goalPage = 1;
const canEditAssessmentPhoto = localStorage.getItem('academiaRole') === 'student';

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
  if (!response.ok) throw new Error(data.error || `http_${response.status}`);
  return data;
}

function assessmentErrorMessage(error) {
  const messages = {
    acesso_negado: 'Seu perfil não tem permissão para alterar avaliações.',
    not_implemented: 'O servidor bloqueou o método de atualização. Tente novamente; a rota compatível já foi ativada.',
    http_501: 'O servidor bloqueou o método de atualização. Tente novamente; a rota compatível já foi ativada.',
    internal_error: 'O servidor não conseguiu salvar. Verifique a conexão com o banco de dados.',
    foto_somente_aluno: 'A foto de evolução só pode ser enviada ou alterada pelo próprio aluno.',
    foto_invalida: 'A foto precisa ser um link http(s) válido ou uma imagem enviada pelo formulário.',
    imagem_muito_grande: 'A imagem não pode ultrapassar 5 MB.',
    formato_de_imagem_invalido: 'Escolha uma imagem JPG, PNG, GIF ou WebP.',
    http_403: 'Seu perfil não tem permissão para alterar avaliações.',
    http_500: 'O servidor não conseguiu salvar. Verifique a conexão com o banco de dados.'
  };
  return messages[error.message] || error.message || 'Não foi possível concluir a operação.';
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

function fillFilterSelect(members) {
  fillSelect('assessment-filter-member', members);
  const select = q('assessment-filter-member');
  if (select && !select.options[0].textContent.includes('Todos')) select.options[0].textContent = 'Todos os alunos';
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

function decimalValue(id) {
  const raw = value(id).trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInputDecimal(valueToFormat) {
  if (valueToFormat === null || valueToFormat === undefined || valueToFormat === '') return '';
  const parsed = Number(valueToFormat);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 })
    : String(valueToFormat);
}

const MAX_ASSESSMENT_PHOTO_BYTES = 5 * 1024 * 1024;

function previewAssessmentPhoto(source) {
  const image = q('assessment-photo-preview');
  const empty = q('assessment-photo-empty');
  if (!image || !empty) return;
  image.hidden = !source;
  empty.hidden = Boolean(source);
  image.src = source || '';
}

async function uploadAssessmentPhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('formato_de_imagem_invalido');
  if (file.size > MAX_ASSESSMENT_PHOTO_BYTES) throw new Error('imagem_muito_grande');
  const formData = new FormData();
  formData.append('file', file, file.name);
  const response = await fetch(`${ASSESSMENT_API}/api/editor/images`, { method: 'POST', body: formData, headers: { Authorization: `Bearer ${ASSESSMENT_TOKEN}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'falha_no_upload');
  return data.location || '';
}

async function resolveAssessmentPhoto() {
  if (!canEditAssessmentPhoto) return preservedAssessmentPhoto;
  const file = q('assessment-photo-file')?.files?.[0];
  if (file) return uploadAssessmentPhoto(file);
  return value('photo-url').trim();
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

function assessmentMobileMenu(label, items) {
  const wrap = document.createElement('div');
  wrap.className = 'mobile-card-menu';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mobile-card-menu-trigger';
  trigger.textContent = '⋮';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', 'false');
  const dropdown = document.createElement('div');
  dropdown.className = 'mobile-card-menu-dropdown hidden';
  for (const item of items) {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = item.label;
    if (item.danger) action.classList.add('danger');
    action.addEventListener('click', async (event) => {
      event.stopPropagation();
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      await item.run(action);
    });
    dropdown.appendChild(action);
  }
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = dropdown.classList.contains('hidden');
    document.querySelectorAll('.mobile-card-menu-dropdown').forEach((menu) => menu.classList.add('hidden'));
    document.querySelectorAll('.mobile-card-menu-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
    dropdown.classList.toggle('hidden', !willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
  });
  wrap.addEventListener('click', (event) => event.stopPropagation());
  wrap.addEventListener('keydown', (event) => event.stopPropagation());
  wrap.append(trigger, dropdown);
  return wrap;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.mobile-card-menu-dropdown').forEach((menu) => menu.classList.add('hidden'));
  document.querySelectorAll('.mobile-card-menu-trigger').forEach((button) => button.setAttribute('aria-expanded', 'false'));
});

function resetAssessmentForm() {
  q('assessment-form')?.reset();
  q('assessment-date').value = new Date().toISOString().slice(0, 10);
  setModalStatus('assessment-form-status', '');
  editingAssessmentId = '';
  preservedAssessmentPhoto = '';
  q('assessment-modal-title').textContent = 'Nova avaliação';
  q('create-assessment-button').textContent = 'Salvar avaliação';
  if (q('assessment-photo-file')) q('assessment-photo-file').value = '';
  previewAssessmentPhoto('');
}

function resetGoalForm() {
  q('goal-form')?.reset();
  setModalStatus('goal-form-status', '');
  editingGoalId = '';
  q('goal-modal-title').textContent = 'Nova meta';
  q('create-goal-button').textContent = 'Salvar meta';
}

function openAssessmentModal(memberId = '') {
  resetAssessmentForm();
  if (memberId) q('assessment-member').value = memberId;
  openModal('assessment-modal', 'assessment-member');
}

function openGoalModal() {
  resetGoalForm();
  openModal('goal-modal', 'goal-member');
}

function filterAssessments(rows) {
  const memberId = q('assessment-filter-member')?.value || '';
  const from = q('assessment-filter-from')?.value || '';
  const to = q('assessment-filter-to')?.value || '';
  return rows.filter((item) => {
    const date = String(item.assessment_date || '').slice(0, 10);
    return (!memberId || item.member_id === memberId) && (!from || date >= from) && (!to || date <= to);
  });
}

function filterGoals(rows) {
  const memberId = q('assessment-filter-member')?.value || '';
  return rows.filter((item) => !memberId || item.member_id === memberId);
}

function setField(id, valueToSet) {
  if (q(id)) q(id).value = valueToSet ?? '';
}

function openAssessmentEdit(item) {
  editingAssessmentId = item.id;
  preservedAssessmentPhoto = item.photo_url || '';
  setField('assessment-member', item.member_id);
  setField('assessment-date', String(item.assessment_date || '').slice(0, 10));
  setField('weight-kg', formatInputDecimal(item.weight_kg)); setField('height-cm', formatInputDecimal(item.height_cm)); setField('body-fat', formatInputDecimal(item.body_fat_percent)); setField('muscle-mass', formatInputDecimal(item.muscle_mass_kg)); setField('waist-cm', formatInputDecimal(item.waist_cm)); setField('chest-cm', formatInputDecimal(item.chest_cm)); setField('hip-cm', formatInputDecimal(item.hip_cm)); setField('biceps-cm', formatInputDecimal(item.biceps_cm)); setField('back-cm', formatInputDecimal(item.back_cm)); setField('photo-url', item.photo_url); setField('assessment-notes', item.notes);
  previewAssessmentPhoto(item.photo_url);
  q('assessment-modal-title').textContent = 'Editar avaliação';
  q('create-assessment-button').textContent = 'Salvar alterações';
  setModalStatus('assessment-form-status', '');
  for (const field of document.querySelectorAll('[data-assessment-photo-field]')) field.classList.toggle('hidden', !canEditAssessmentPhoto);
  openModal('assessment-modal', 'assessment-member');
}

function setAssessmentViewImage(source, alt = 'Foto da avaliação') {
  const image = q('assessment-view-photo');
  const empty = q('assessment-view-photo-empty');
  if (!image || !empty) return;
  image.hidden = !source;
  empty.hidden = Boolean(source);
  image.alt = alt;
  image.src = source || '';
}

function renderAssessmentPhotoHistory(memberId) {
  const strip = q('assessment-view-photo-history');
  if (!strip) return;
  strip.innerHTML = '';
  const photos = currentAssessments.filter((item) => item.member_id === memberId && item.photo_url);
  if (!photos.length) {
    strip.innerHTML = '<span class="assessment-photo-history-empty">Nenhuma foto registrada.</span>';
    return;
  }
  for (const item of photos) {
    const image = document.createElement('img');
    image.src = item.photo_url;
    image.alt = `Foto de ${formatDate(item.assessment_date)}`;
    image.title = `Avaliação de ${formatDate(item.assessment_date)}`;
    image.loading = 'lazy';
    strip.appendChild(image);
  }
}

function openAssessmentView(item) {
  q('assessment-view-name').textContent = item.member_name || 'Aluno';
  q('assessment-view-date').textContent = formatDate(item.assessment_date);
  q('assessment-view-weight').textContent = formatNumber(item.weight_kg, ' kg');
  q('assessment-view-height').textContent = formatNumber(item.height_cm, ' cm');
  q('assessment-view-fat').textContent = formatNumber(item.body_fat_percent, '%');
  q('assessment-view-muscle').textContent = formatNumber(item.muscle_mass_kg, ' kg');
  q('assessment-view-waist').textContent = formatNumber(item.waist_cm, ' cm');
  q('assessment-view-chest').textContent = formatNumber(item.chest_cm, ' cm');
  q('assessment-view-hip').textContent = formatNumber(item.hip_cm, ' cm');
  q('assessment-view-biceps').textContent = formatNumber(item.biceps_cm, ' cm');
  q('assessment-view-back').textContent = formatNumber(item.back_cm, ' cm');
  q('assessment-view-notes').textContent = item.notes || 'Sem observações registradas.';
  const goal = currentGoals.find((candidate) => candidate.member_id === item.member_id && candidate.status !== 'closed');
  q('assessment-view-goal').textContent = goal ? `${goal.goal_type} · alvo ${formatNumber(goal.target_value)} · prazo ${formatDate(goal.target_date)}` : 'Nenhuma meta ativa vinculada.';
  setAssessmentViewImage(item.photo_url);
  renderAssessmentPhotoHistory(item.member_id);
  openModal('assessment-view-modal');
}

function openGoalEdit(item) {
  editingGoalId = item.id;
  setField('goal-member', item.member_id); setField('goal-type', item.goal_type); setField('goal-value', formatInputDecimal(item.target_value)); setField('goal-date', String(item.target_date || '').slice(0, 10)); setField('goal-notes', item.notes);
  q('goal-modal-title').textContent = 'Editar meta';
  q('create-goal-button').textContent = 'Salvar alterações';
  setModalStatus('goal-form-status', '');
  openModal('goal-modal', 'goal-type');
}

function openGoalView(item) {
  q('goal-view-member').textContent = item.member_name || 'Aluno';
  q('goal-view-type').textContent = item.goal_type || 'Meta';
  q('goal-view-value').textContent = formatNumber(item.target_value);
  q('goal-view-date').textContent = formatDate(item.target_date);
  q('goal-view-status').textContent = item.status === 'active' ? 'Ativa' : (item.status || 'Encerrada');
  q('goal-view-notes').textContent = item.notes || 'Sem observações registradas.';
  openModal('goal-view-modal');
}

async function deleteAssessment(item) {
  if (!window.confirm(`Excluir a avaliação de ${item.member_name || 'este aluno'}?`)) return;
  try {
    await api(`/api/assessments/${item.id}`, { method: 'DELETE' });
    setAssessmentStatus('Avaliação excluída.');
    await loadAssessments({ force: true });
  } catch (error) { setAssessmentStatus(`Erro ao excluir avaliação: ${assessmentErrorMessage(error)}`); }
}

async function deleteGoal(item) {
  if (!window.confirm(`Excluir a meta ${item.goal_type || ''}?`)) return;
  try {
    await api(`/api/goals/${item.id}`, { method: 'DELETE' });
    setAssessmentStatus('Meta excluída.');
    await loadGoals({ force: true });
  } catch (error) { setAssessmentStatus(`Erro ao excluir meta: ${assessmentErrorMessage(error)}`); }
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
  const pages = Math.max(1, Math.ceil(rows.length / ASSESSMENT_PAGE_SIZE));
  assessmentPage = Math.min(pages, Math.max(1, assessmentPage));
  const visibleRows = rows.slice((assessmentPage - 1) * ASSESSMENT_PAGE_SIZE, assessmentPage * ASSESSMENT_PAGE_SIZE);
  window.AdminPagination?.render(q('assessment-pagination'), {
    page: assessmentPage,
    total: rows.length,
    pageSize: ASSESSMENT_PAGE_SIZE,
    onChange: (page) => { assessmentPage = page; renderAssessments(filterAssessments(currentAssessments)); }
  });

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma avaliação registrada.';
    list.appendChild(empty);
    return;
  }

  for (const item of visibleRows) {
    const row = document.createElement('li');
    row.className = 'workflow-record';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Visualizar avaliação de ${item.member_name || 'aluno'}`);
    row.addEventListener('click', () => openAssessmentView(item));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAssessmentView(item); } });

    const main = document.createElement('div');
    main.className = 'workflow-record-main';
    const title = document.createElement('strong');
    title.textContent = item.member_name || 'Aluno';
    const date = document.createElement('span');
    date.textContent = `Avaliação em ${formatDate(item.assessment_date)}`;
    const metrics = document.createElement('small');
    metrics.textContent = `Peso: ${formatNumber(item.weight_kg, ' kg')} · Gordura: ${formatNumber(item.body_fat_percent, '%')} · Cintura: ${formatNumber(item.waist_cm, ' cm')}`;
    main.append(title, date, metrics);
    const relatedGoal = currentGoals.find((goal) => goal.member_id === item.member_id && goal.status !== 'closed');
    if (relatedGoal) {
      const goal = document.createElement('small');
      goal.className = 'assessment-goal-link';
      goal.textContent = `Meta vinculada: ${relatedGoal.goal_type} · alvo ${formatNumber(relatedGoal.target_value)}`;
      main.appendChild(goal);
    }
    const actions = document.createElement('div');
    actions.className = 'workflow-record-actions';
    if (item.photo_url) {
      const thumb = document.createElement('img');
      thumb.className = 'assessment-photo-thumb'; thumb.src = item.photo_url; thumb.alt = ''; thumb.loading = 'lazy';
      actions.appendChild(thumb);
    }
    const edit = window.AcademiaIcons.button('edit', 'Editar avaliação');
    edit.addEventListener('click', (event) => { event.stopPropagation(); openAssessmentEdit(item); });
    const remove = window.AcademiaIcons.button('trash', 'Excluir avaliação', 'danger');
    remove.addEventListener('click', (event) => { event.stopPropagation(); deleteAssessment(item); });
    actions.append(edit, remove);
    row.append(main, actions, assessmentMobileMenu(`Opções da avaliação de ${item.member_name || 'aluno'}`, [
      { label: 'Editar', run: () => openAssessmentEdit(item) },
      { label: 'Excluir', danger: true, run: () => deleteAssessment(item) }
    ]));
    list.appendChild(row);
  }
}

function renderGoals(rows) {
  const list = q('goal-list');
  if (!list) return;
  list.innerHTML = '';
  const pages = Math.max(1, Math.ceil(rows.length / ASSESSMENT_PAGE_SIZE));
  goalPage = Math.min(pages, Math.max(1, goalPage));
  const visibleRows = rows.slice((goalPage - 1) * ASSESSMENT_PAGE_SIZE, goalPage * ASSESSMENT_PAGE_SIZE);
  window.AdminPagination?.render(q('goal-pagination'), {
    page: goalPage,
    total: rows.length,
    pageSize: ASSESSMENT_PAGE_SIZE,
    onChange: (page) => { goalPage = page; renderGoals(filterGoals(currentGoals)); }
  });

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma meta cadastrada.';
    list.appendChild(empty);
    return;
  }

  for (const item of visibleRows) {
    const row = document.createElement('li');
    row.className = 'workflow-record';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Visualizar meta de ${item.member_name || 'aluno'}`);
    row.addEventListener('click', () => openGoalView(item));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openGoalView(item); } });

    const main = document.createElement('div');
    main.className = 'workflow-record-main';
    const title = document.createElement('strong');
    title.textContent = `${item.member_name || 'Aluno'} · ${item.goal_type || 'Meta'}`;
    const target = document.createElement('span');
    target.textContent = `Alvo: ${formatNumber(item.target_value)} · Data: ${formatDate(item.target_date)}`;
    const status = document.createElement('small');
    status.textContent = `Status: ${item.status || 'aberta'}`;
    main.append(title, target, status);
    const actions = document.createElement('div');
    actions.className = 'workflow-record-actions';
    const edit = window.AcademiaIcons.button('edit', 'Editar meta');
    edit.addEventListener('click', (event) => { event.stopPropagation(); openGoalEdit(item); });
    const remove = window.AcademiaIcons.button('trash', 'Excluir meta', 'danger');
    remove.addEventListener('click', (event) => { event.stopPropagation(); deleteGoal(item); });
    actions.append(edit, remove);
    row.append(main, actions, assessmentMobileMenu(`Opções da meta de ${item.member_name || 'aluno'}`, [
      { label: 'Editar', run: () => openGoalEdit(item) },
      { label: 'Excluir', danger: true, run: () => deleteGoal(item) }
    ]));
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
    item.waist_cm,
    item.photo_url,
    item.notes
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
    currentAssessments = rows;
    const signature = assessmentsSignature(rows);
    if (force || signature !== lastAssessmentsSignature) {
      renderAssessments(filterAssessments(rows));
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
    currentGoals = rows;
    const signature = goalsSignature(rows);
    if (force || signature !== lastGoalsSignature) {
      renderGoals(filterGoals(rows));
      renderAssessments(filterAssessments(currentAssessments));
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
  fillFilterSelect(members);
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
    await api(editingAssessmentId ? `/api/assessments/${editingAssessmentId}/update` : '/api/assessments', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('assessment-member'),
        assessment_date: value('assessment-date') || null,
        weight_kg: decimalValue('weight-kg'),
        height_cm: decimalValue('height-cm'),
        body_fat_percent: decimalValue('body-fat'),
        muscle_mass_kg: decimalValue('muscle-mass'),
        waist_cm: decimalValue('waist-cm'),
        chest_cm: decimalValue('chest-cm'),
        hip_cm: decimalValue('hip-cm'),
        biceps_cm: decimalValue('biceps-cm'),
        back_cm: decimalValue('back-cm'),
        photo_url: await resolveAssessmentPhoto(),
        notes: value('assessment-notes')
      })
    });
    closeModal('assessment-modal');
    setAssessmentStatus(editingAssessmentId ? 'Avaliação atualizada.' : 'Avaliação salva.');
    await loadAssessments({ force: true });
  } catch (error) {
    setModalStatus('assessment-form-status', `Erro: ${assessmentErrorMessage(error)}`);
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
    await api(editingGoalId ? `/api/goals/${editingGoalId}/update` : '/api/goals', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('goal-member'),
        goal_type: value('goal-type'),
        target_value: decimalValue('goal-value'),
        target_date: value('goal-date') || null,
        notes: value('goal-notes')
      })
    });
    closeModal('goal-modal');
    setAssessmentStatus(editingGoalId ? 'Meta atualizada.' : 'Meta salva.');
    await loadGoals({ force: true });
  } catch (error) {
    setModalStatus('goal-form-status', `Erro: ${assessmentErrorMessage(error)}`);
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
      `Variação de cintura: ${formatNumber(result.delta?.waist_cm, ' cm')}`,
      `Análise inteligente: ${result.analysis?.message || 'Registre uma segunda medição para comparar.'}`
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

function assessmentExportQuery() {
  const params = new URLSearchParams();
  const memberId = q('assessment-filter-member')?.value || '';
  const from = q('assessment-filter-from')?.value || '';
  const to = q('assessment-filter-to')?.value || '';
  if (memberId) params.set('member_id', memberId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params.toString();
}

async function downloadAssessmentExport(format) {
  const response = await fetch(`${ASSESSMENT_API}/api/exports/assessments.${format}?${assessmentExportQuery()}`, { headers: { Authorization: `Bearer ${ASSESSMENT_TOKEN}` } });
  if (!response.ok) throw new Error('não foi possível gerar o arquivo');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `avaliacoes-e-metas.${format}`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}

function bindAssessmentEvents() {
  q('open-assessment-modal')?.addEventListener('click', openAssessmentModal);
  q('open-goal-modal')?.addEventListener('click', openGoalModal);
  q('open-summary-modal')?.addEventListener('click', openSummaryModal);
  q('assessment-filter-toggle')?.addEventListener('click', () => {
    const panel = document.querySelector('.assessment-filter-panel');
    const body = q('assessment-filter-modal-body');
    if (!panel || !body) return;
    assessmentFilterPlaceholder = document.createComment('assessment-filter-placeholder');
    panel.parentElement.insertBefore(assessmentFilterPlaceholder, panel);
    body.appendChild(panel);
    q('assessment-filter-modal').classList.remove('hidden');
  });
  const closeAssessmentFilters = () => {
    const panel = document.querySelector('#assessment-filter-modal .assessment-filter-panel');
    if (panel && assessmentFilterPlaceholder?.parentElement) assessmentFilterPlaceholder.parentElement.insertBefore(panel, assessmentFilterPlaceholder.nextSibling);
    assessmentFilterPlaceholder?.remove();
    assessmentFilterPlaceholder = null;
    q('assessment-filter-modal')?.classList.add('hidden');
  };
  q('close-assessment-filter-modal')?.addEventListener('click', closeAssessmentFilters);
  q('assessment-filter-modal')?.addEventListener('click', (event) => { if (event.target === q('assessment-filter-modal')) closeAssessmentFilters(); });

  q('assessment-form')?.addEventListener('submit', createAssessment);
  q('goal-form')?.addEventListener('submit', createGoal);
  q('assessment-photo-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return previewAssessmentPhoto(value('photo-url'));
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || file.size > MAX_ASSESSMENT_PHOTO_BYTES) {
      setModalStatus('assessment-form-status', 'Escolha uma imagem JPG, PNG, GIF ou WebP de até 5 MB.');
      event.target.value = '';
      return previewAssessmentPhoto('');
    }
    previewAssessmentPhoto(URL.createObjectURL(file));
  });
  q('photo-url')?.addEventListener('input', (event) => { if (!q('assessment-photo-file')?.files?.length) previewAssessmentPhoto(event.target.value.trim()); });
  q('load-summary-button')?.addEventListener('click', loadSummary);
  q('apply-assessment-filters')?.addEventListener('click', () => { assessmentPage = 1; goalPage = 1; renderAssessments(filterAssessments(currentAssessments)); renderGoals(filterGoals(currentGoals)); });
  q('download-assessments-csv')?.addEventListener('click', () => downloadAssessmentExport('csv').catch((error) => setAssessmentStatus(`Erro ao exportar CSV: ${error.message}`)));
  q('download-assessments-pdf')?.addEventListener('click', () => downloadAssessmentExport('pdf').catch((error) => setAssessmentStatus(`Erro ao exportar PDF: ${error.message}`)));

  q('close-assessment-modal')?.addEventListener('click', () => closeModal('assessment-modal'));
  q('cancel-assessment-modal')?.addEventListener('click', () => closeModal('assessment-modal'));
  q('close-assessment-view-modal')?.addEventListener('click', () => closeModal('assessment-view-modal'));
  q('close-goal-view-modal')?.addEventListener('click', () => closeModal('goal-view-modal'));
  q('close-goal-modal')?.addEventListener('click', () => closeModal('goal-modal'));
  q('cancel-goal-modal')?.addEventListener('click', () => closeModal('goal-modal'));
  q('close-summary-modal')?.addEventListener('click', () => closeModal('summary-modal'));
  q('cancel-summary-modal')?.addEventListener('click', () => closeModal('summary-modal'));

  for (const modalId of ['assessment-modal', 'goal-modal', 'summary-modal', 'assessment-view-modal', 'goal-view-modal']) {
    q(modalId)?.addEventListener('click', (event) => {
      if (event.target === q(modalId)) closeModal(modalId);
    });
  }
}

async function initAssessmentsPage() {
  bindAssessmentEvents();
  for (const field of document.querySelectorAll('[data-assessment-photo-field]')) field.classList.toggle('hidden', !canEditAssessmentPhoto);
  try {
    await loadBase();
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') openAssessmentModal(params.get('member_id') || '');
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
