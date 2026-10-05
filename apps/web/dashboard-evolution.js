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
      } else if (kind === 'training') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dashboard-evolution-person';
        const name = document.createElement('strong');
        name.textContent = item.member_name || 'Aluno';
        const detail = document.createElement('span');
        detail.textContent = category.detail(item);
        const action = document.createElement('small');
        action.textContent = 'Revisar ficha';
        button.append(name, detail, action);
        button.addEventListener('click', () => {
          window.location.href = `./training.html?plan_id=${encodeURIComponent(item.id || '')}&action=review`;
        });
        row.appendChild(button);
      } else if (kind === 'membership') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dashboard-evolution-person';
        const name = document.createElement('strong');
        name.textContent = item.member_name || 'Aluno';
        const detail = document.createElement('span');
        detail.textContent = category.detail(item);
        const action = document.createElement('small');
        action.textContent = 'Ver matrícula';
        button.append(name, detail, action);
        button.addEventListener('click', () => {
          window.location.href = './vinculos.html';
        });
        row.appendChild(button);
      } else if (kind === 'finance') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dashboard-evolution-person';
        const name = document.createElement('strong');
        name.textContent = item.member_name || 'Aluno';
        const detail = document.createElement('span');
        detail.textContent = category.detail(item);
        const action = document.createElement('small');
        action.textContent = 'Ver financeiro';
        button.append(name, detail, action);
        button.addEventListener('click', () => {
          window.location.href = './financeiro.html';
        });
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

  /* =========================================================
     COCKPIT LOGIC (Weekly Chart, Live Feed, Fast Check-in, Churn)
     ========================================================= */

  function playSuccessTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {}
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'Agora mesmo';
    if (diff < 3600) return `Há ${Math.floor(diff / 60)} min`;
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function loadCockpit() {
    if (!token) return;
    try {
      const data = await api('/api/dashboard/cockpit');

      // 1. Weekly Attendance Chart
      const chartHost = byId('cockpit-week-chart');
      if (chartHost && Array.isArray(data.week_attendance)) {
        chartHost.replaceChildren();
        const days = data.week_attendance;
        const maxCount = Math.max(...days.map((d) => Number(d.count) || 0), 1);
        const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

        let total = 0;
        days.forEach((day, idx) => {
          const count = Number(day.count) || 0;
          total += count;
          const pct = Math.round((count / maxCount) * 100);

          const group = document.createElement('div');
          group.className = 'chart-bar-group';
          group.innerHTML = `
            <span class="chart-bar-count">${count}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill" style="height: ${Math.max(pct, count > 0 ? 8 : 0)}%;"></div>
            </div>
            <span class="chart-bar-label">${dayLabels[idx] || day.weekday_name || ''}</span>
          `;
          chartHost.appendChild(group);
        });

        const totalBadge = byId('cockpit-week-total');
        if (totalBadge) totalBadge.textContent = `${total} acesso${total === 1 ? '' : 's'}`;
      }

      // 2. Recent Check-ins (Today)
      const feedHost = byId('cockpit-recent-list');
      if (feedHost) {
        feedHost.replaceChildren();
        const checkins = data.recent_checkins || [];
        if (!checkins.length) {
          feedHost.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px;">Nenhuma presença registrada hoje ainda.</div>';
        } else {
          checkins.forEach((c) => {
            const item = document.createElement('div');
            item.className = 'cockpit-feed-item';
            const initial = (c.member_name || 'A').charAt(0).toUpperCase();
            item.innerHTML = `
              <div class="cockpit-feed-user">
                <span class="cockpit-feed-avatar">${initial}</span>
                <strong style="color:var(--text);">${escapeHtml(c.member_name)}</strong>
              </div>
              <span class="cockpit-feed-time">${relativeTime(c.checked_at)}</span>
            `;
            feedHost.appendChild(item);
          });
        }
      }

      // 3. Churn Radar
      const churnHost = byId('cockpit-churn-list');
      if (churnHost) {
        churnHost.replaceChildren();
        const atRisk = data.churn_risk || [];
        if (!atRisk.length) {
          churnHost.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px;">🎉 Excelente! Nenhum aluno com mais de 10 dias sem treinar.</div>';
        } else {
          atRisk.forEach((m) => {
            const item = document.createElement('div');
            item.className = 'cockpit-feed-item';
            const phoneClean = String(m.phone || '').replace(/\D/g, '');
            const waMsg = encodeURIComponent(`Olá ${m.name}! Sentimos sua falta aqui na academia BlueREC. Como você está? Vamos agendar um treino essa semana?`);
            const waUrl = phoneClean ? `https://wa.me/55${phoneClean}?text=${waMsg}` : '#';

            item.innerHTML = `
              <div class="cockpit-feed-user">
                <div>
                  <strong style="color:var(--text);display:block;">${escapeHtml(m.name)}</strong>
                  <span style="font-size:11px;color:#b45309;font-weight:700;">${m.days_absent} dias sem treinar</span>
                </div>
              </div>
              ${phoneClean ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="cockpit-wa-btn" title="Enviar mensagem no WhatsApp">💬 Reengajar</a>` : '<span style="font-size:11px;color:var(--muted);">Sem telefone</span>'}
            `;
            churnHost.appendChild(item);
          });
        }
      }
    } catch (_) {}
  }

  function escapeHtml(val) {
    return String(val || '').replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
  }

  // Fast Check-in Form Submission & Expandable Toggle
  const receptionToggle = byId('cockpit-reception-toggle');
  const receptionClose = byId('cockpit-checkin-close');
  const checkinForm = byId('cockpit-checkin-form');
  const checkinInput = byId('cockpit-checkin-input');
  const checkinStatus = byId('cockpit-checkin-status');
  const checkinBtn = byId('cockpit-checkin-btn');

  function openReception() {
    receptionToggle?.classList.add('hidden');
    checkinForm?.classList.remove('hidden');
    receptionToggle?.setAttribute('aria-expanded', 'true');
    setTimeout(() => checkinInput?.focus(), 40);
  }

  function closeReception() {
    checkinForm?.classList.add('hidden');
    receptionToggle?.classList.remove('hidden');
    receptionToggle?.setAttribute('aria-expanded', 'false');
    if (checkinInput) checkinInput.value = '';
    if (checkinStatus) checkinStatus.classList.add('hidden');
  }

  receptionToggle?.addEventListener('click', openReception);
  receptionClose?.addEventListener('click', closeReception);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && checkinForm && !checkinForm.classList.contains('hidden')) {
      closeReception();
    }
  });

  checkinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = checkinInput?.value.trim();
    if (!query) return;

    checkinBtn.disabled = true;
    checkinStatus.classList.remove('hidden', 'is-success', 'is-error');
    checkinStatus.textContent = 'Registrando presença...';

    try {
      const res = await api('/api/checkins/quick', {
        method: 'POST',
        body: JSON.stringify({ query })
      });
      playSuccessTone();
      checkinStatus.classList.add('is-success');
      checkinStatus.textContent = `✓ ${res.message || 'Presença confirmada!'}`;
      checkinInput.value = '';
      void loadCockpit();
      setTimeout(() => {
        checkinStatus.classList.add('hidden');
        closeReception();
      }, 2500);
    } catch (err) {
      checkinStatus.classList.add('is-error');
      checkinStatus.textContent = `⚠ ${err.message || 'Aluno não encontrado ou inativo.'}`;
    } finally {
      checkinBtn.disabled = false;
      checkinInput?.focus();
    }
  });

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

  const browserTabs = document.querySelectorAll('.cockpit-browser-tab');
  const tabPanels = document.querySelectorAll('.cockpit-tab-panel');
  browserTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.panel;
      browserTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach((p) => {
        p.classList.add('hidden');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetPanel = byId(targetId);
      if (targetPanel) targetPanel.classList.remove('hidden');
    });
  });

  void loadAlerts();
  void loadCockpit();
  window.setInterval(() => {
    void loadAlerts();
    void loadCockpit();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void loadAlerts();
      void loadCockpit();
    }
  });
})();
