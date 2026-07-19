(() => {
  const host = window.location.hostname || 'localhost';
  const apiBase = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  const token = localStorage.getItem('academiaToken') || '';
  const byId = (id) => document.getElementById(id);
  let alerts = null;
  let activeKind = '';
  let loading = false;

  const categories = {
    finance: {
      title: 'Pagamentos vencidos',
      rows: 'overdue_payments',
      empty: 'Nenhum pagamento vencido.',
      count: 'dashboard-overdue-count',
      detail: (item) => `${money(item.amount_cents)} · vencido há ${item.days_overdue} dia(s)`
    },
    membership: {
      title: 'Matrículas vencendo',
      rows: 'memberships_due_soon',
      empty: 'Nenhuma matrícula vencendo nos próximos 7 dias.',
      count: 'dashboard-membership-due-count',
      detail: (item) => `Vence em ${item.days_remaining} dia(s)`
    },
    training: {
      title: 'Fichas para revisar',
      rows: 'training_reviews_due',
      empty: 'Nenhuma ficha precisando de revisão.',
      count: 'dashboard-training-review-count',
      detail: (item) => `${item.plan_name || 'Ficha'} · ${item.age_days} dia(s)`
    },
    evolution: {
      title: 'Avaliações pendentes',
      rows: 'assessments_due',
      empty: 'Nenhuma avaliação pendente.',
      count: 'dashboard-assessment-due-count'
    }
  };

  function money(value) {
    return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    return data;
  }

  function setModalOpen(modal, open) {
    modal.classList.toggle('hidden', !open);
    modal.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal:not(.hidden)')));
  }

  function updateCounts() {
    if (!alerts) return;
    for (const category of Object.values(categories)) {
      byId(category.count).textContent = String(alerts.summary?.[
        category.rows === 'overdue_payments' ? 'overdue_payments'
          : category.rows === 'memberships_due_soon' ? 'memberships_due_soon'
            : category.rows === 'training_reviews_due' ? 'training_reviews_due'
              : 'assessments_due'
      ] || 0);
    }
  }

  function assessmentDetail(item) {
    return item.last_assessment_date
      ? `Última avaliação há ${item.days_since_last_assessment} dia(s)`
      : 'Nunca realizou uma avaliação';
  }

  function renderAlertList(kind) {
    const category = categories[kind];
    const list = byId('dashboard-alert-list');
    const rows = alerts?.[category.rows] || [];
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'dashboard-alert-empty';
      empty.textContent = category.empty;
      list.appendChild(empty);
      return;
    }
    for (const item of rows) {
      const row = document.createElement('li');
      if (kind === 'evolution') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dashboard-evolution-person';
        const name = document.createElement('strong');
        name.textContent = item.member_name || 'Aluno';
        const detail = document.createElement('span');
        detail.textContent = assessmentDetail(item);
        const action = document.createElement('small');
        action.textContent = 'Fazer avaliação';
        button.append(name, detail, action);
        button.addEventListener('click', () => openAssessment(item));
        row.appendChild(button);
      } else {
        row.className = 'dashboard-alert-row';
        const name = document.createElement('strong');
        name.textContent = item.member_name || 'Aluno';
        const detail = document.createElement('span');
        detail.textContent = category.detail(item);
        row.append(name, detail);
      }
      list.appendChild(row);
    }
  }

  async function loadAlerts() {
    if (loading || !token) return;
    loading = true;
    try {
      alerts = await api('/api/alerts');
      updateCounts();
      byId('dashboard-alerts-status').textContent = '';
      if (activeKind && !byId('dashboard-alert-modal').classList.contains('hidden')) renderAlertList(activeKind);
    } catch (error) {
      byId('dashboard-alerts-status').textContent = `Não foi possível carregar as pendências: ${error.message}`;
    } finally {
      loading = false;
    }
  }

  async function openAlert(kind, event) {
    event?.preventDefault();
    activeKind = kind;
    const category = categories[kind];
    byId('dashboard-alert-title').textContent = category.title;
    byId('dashboard-alert-modal-status').textContent = '';
    setModalOpen(byId('dashboard-alert-modal'), true);
    if (!alerts) {
      byId('dashboard-alert-modal-status').textContent = 'Carregando...';
      await loadAlerts();
      byId('dashboard-alert-modal-status').textContent = '';
    }
    renderAlertList(kind);
  }

  function closeAlert() {
    setModalOpen(byId('dashboard-alert-modal'), false);
  }

  function localDate() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function numberValue(id) {
    const value = String(byId(id)?.value || '').trim().replace(',', '.');
    return value ? Number(value) : null;
  }

  function openAssessment(item) {
    closeAlert();
    const form = byId('dashboard-assessment-form');
    form.reset();
    byId('dashboard-assessment-member').value = item.member_id || '';
    byId('dashboard-assessment-member-name').textContent = item.member_name || 'Aluno';
    byId('dashboard-assessment-date').value = localDate();
    byId('dashboard-assessment-status').textContent = '';
    setModalOpen(byId('dashboard-assessment-modal'), true);
    byId('dashboard-assessment-weight').focus();
  }

  function closeAssessment() {
    setModalOpen(byId('dashboard-assessment-modal'), false);
  }

  async function saveAssessment(event) {
    event.preventDefault();
    const form = byId('dashboard-assessment-form');
    if (!form.reportValidity()) return;
    const button = byId('save-dashboard-assessment');
    const status = byId('dashboard-assessment-status');
    button.disabled = true;
    status.textContent = 'Salvando...';
    try {
      await api('/api/assessments', {
        method: 'POST',
        body: JSON.stringify({
          member_id: byId('dashboard-assessment-member').value,
          assessment_date: byId('dashboard-assessment-date').value || null,
          weight_kg: numberValue('dashboard-assessment-weight'),
          height_cm: numberValue('dashboard-assessment-height'),
          body_fat_percent: numberValue('dashboard-assessment-fat'),
          muscle_mass_kg: numberValue('dashboard-assessment-muscle'),
          waist_cm: numberValue('dashboard-assessment-waist'),
          chest_cm: numberValue('dashboard-assessment-chest'),
          hip_cm: numberValue('dashboard-assessment-hip'),
          biceps_cm: numberValue('dashboard-assessment-biceps'),
          back_cm: numberValue('dashboard-assessment-back'),
          photo_url: null,
          notes: byId('dashboard-assessment-notes').value.trim() || null
        })
      });
      closeAssessment();
      alerts = null;
      await loadAlerts();
      await openAlert('evolution');
    } catch (error) {
      status.textContent = `Não foi possível salvar: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('[data-dashboard-alert]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => void openAlert(trigger.dataset.dashboardAlert, event));
  });
  byId('close-dashboard-alert')?.addEventListener('click', closeAlert);
  byId('dashboard-alert-modal')?.addEventListener('click', (event) => {
    if (event.target === byId('dashboard-alert-modal')) closeAlert();
  });
  byId('dashboard-assessment-form')?.addEventListener('submit', saveAssessment);
  byId('close-dashboard-assessment')?.addEventListener('click', closeAssessment);
  byId('cancel-dashboard-assessment')?.addEventListener('click', closeAssessment);
  byId('dashboard-assessment-modal')?.addEventListener('click', (event) => {
    if (event.target === byId('dashboard-assessment-modal')) closeAssessment();
  });

  void loadAlerts();
  window.setInterval(() => void loadAlerts(), 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadAlerts();
  });
})();
