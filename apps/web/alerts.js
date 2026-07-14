const alertsHost = window.location.hostname || 'localhost';
const ALERTS_API = localStorage.getItem('apiBaseUrl') || `http://${alertsHost}:3004`;
const ALERTS_TOKEN = localStorage.getItem('academiaToken') || '';
const g = (id) => document.getElementById(id);

async function api(path) {
  const response = await fetch(`${ALERTS_API}${path}`, {
    headers: { Authorization: `Bearer ${ALERTS_TOKEN}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

async function apiWrite(path, options = {}) {
  const response = await fetch(`${ALERTS_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ALERTS_TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function cents(value) {
  return `R$ ${(Number(value || 0) / 100).toFixed(2).replace('.', ',')}`;
}

function renderList(id, rows, formatter, emptyText) {
  const list = g(id);
  list.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('li');
    row.textContent = emptyText;
    list.appendChild(row);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('li');
    row.textContent = formatter(item);
    list.appendChild(row);
  }
}

function renderAssessmentAlerts(rows) {
  const list = g('assessment-alert-list');
  list.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'alert-empty';
    empty.textContent = 'Nenhuma avaliação pendente.';
    list.appendChild(empty);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('li');
    row.className = 'alert-highlight';
    const icon = document.createElement('span');
    icon.className = 'alert-highlight-icon';
    icon.textContent = '!';
    const copy = document.createElement('div');
    copy.className = 'alert-highlight-copy';
    const name = document.createElement('strong');
    name.textContent = item.member_name || 'Aluno';
    const detail = document.createElement('span');
    detail.textContent = item.last_assessment_date
      ? `Última avaliação: ${item.last_assessment_date} · ${item.days_since_last_assessment} dias atrás`
      : 'Este aluno ainda não possui avaliação registrada.';
    copy.append(name, detail);
    const badge = document.createElement('span');
    badge.className = `alert-highlight-badge ${item.last_assessment_date ? 'warn' : 'critical'}`;
    badge.textContent = item.last_assessment_date ? 'Atualizar avaliação' : 'Nunca avaliado';
    row.append(icon, copy, badge);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.title = 'Abrir avaliação do aluno';
    const openAssessment = () => openAssessmentModal(item);
    row.addEventListener('click', openAssessment);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAssessment(); } });
    list.appendChild(row);
  }
}

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function numberValue(id) {
  const value = String(g(id)?.value || '').trim().replace(',', '.');
  return value ? Number(value) : null;
}

function openAssessmentModal(item) {
  const modal = g('alert-assessment-modal');
  const form = g('alert-assessment-form');
  form.reset();
  g('alert-assessment-member').value = item.member_id || '';
  g('alert-assessment-member-name').textContent = item.member_name || 'Aluno';
  g('alert-assessment-date').value = localDate();
  g('alert-assessment-status').textContent = '';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  g('alert-assessment-weight').focus();
}

function closeAssessmentModal() {
  const modal = g('alert-assessment-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function saveAssessment(event) {
  event.preventDefault();
  const form = g('alert-assessment-form');
  if (!form.reportValidity()) return;
  const button = g('save-alert-assessment');
  const status = g('alert-assessment-status');
  button.disabled = true;
  status.textContent = 'Salvando avaliação...';
  try {
    await apiWrite('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({
        member_id: g('alert-assessment-member').value,
        assessment_date: g('alert-assessment-date').value || null,
        weight_kg: numberValue('alert-assessment-weight'),
        height_cm: numberValue('alert-assessment-height'),
        body_fat_percent: numberValue('alert-assessment-fat'),
        muscle_mass_kg: numberValue('alert-assessment-muscle'),
        waist_cm: numberValue('alert-assessment-waist'),
        chest_cm: numberValue('alert-assessment-chest'),
        hip_cm: numberValue('alert-assessment-hip'),
        biceps_cm: numberValue('alert-assessment-biceps'),
        back_cm: numberValue('alert-assessment-back'),
        photo_url: null,
        notes: g('alert-assessment-notes').value.trim() || null
      })
    });
    closeAssessmentModal();
    await loadAlerts();
  } catch (error) {
    status.textContent = `Não foi possível salvar: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function loadAlerts() {
  if (!ALERTS_TOKEN) {
    if (g('alerts-total')) g('alerts-total').textContent = 'login';
    return;
  }
  const data = await api('/api/alerts');
  if (g('alerts-total')) g('alerts-total').textContent = data.summary.total;
  g('overdue-count').textContent = data.summary.overdue_payments;
  g('membership-count').textContent = data.summary.memberships_due_soon;
  g('training-count').textContent = data.summary.training_reviews_due;
  g('assessment-count').textContent = data.summary.assessments_due;

  renderList('overdue-list', data.overdue_payments || [], (item) => `${item.member_name} · ${cents(item.amount_cents)} · vencido há ${item.days_overdue} dias`, 'Nenhum pagamento vencido.');
  renderList('membership-list', data.memberships_due_soon || [], (item) => `${item.member_name} · vence em ${item.days_remaining} dias`, 'Nenhuma matrícula vencendo nos próximos 7 dias.');
  renderList('training-list', data.training_reviews_due || [], (item) => `${item.member_name} · ${item.plan_name} · ${item.age_days} dias de ficha`, 'Nenhuma ficha precisando de revisão.');
  renderAssessmentAlerts(data.assessments_due || []);
}

loadAlerts().catch((error) => {
  if (g('alerts-total')) g('alerts-total').textContent = 'erro';
  renderList('overdue-list', [], () => '', `Erro ao carregar alertas: ${error.message}`);
});

g('alert-assessment-form')?.addEventListener('submit', saveAssessment);
g('close-alert-assessment')?.addEventListener('click', closeAssessmentModal);
g('cancel-alert-assessment')?.addEventListener('click', closeAssessmentModal);
g('alert-assessment-modal')?.addEventListener('click', (event) => { if (event.target === g('alert-assessment-modal')) closeAssessmentModal(); });
