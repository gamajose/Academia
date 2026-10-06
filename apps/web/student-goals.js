(function () {
  const list = document.getElementById('student-goal-list');
  const status = document.getElementById('student-goals-status');
  const modal = document.getElementById('student-goal-modal');
  const form = document.getElementById('student-goal-form');
  const modalTitle = document.getElementById('student-goal-modal-title');
  const formError = document.getElementById('student-goal-form-error');
  const saveButton = document.getElementById('student-goal-save');
  const goalsById = new Map();
  let handledNewGoalRequest = false;

  const icon = (name) => {
    const paths = {
      edit: '<path d="m4 16.5-.7 3.2 3.2-.7L18.7 6.8a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z"/><path d="m14.5 5.5 3 3"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  };

  function formatDate(value) {
    if (!value) return 'Sem prazo';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Sem prazo' : date.toLocaleDateString('pt-BR');
  }

  function formatTarget(value) {
    if (value === null || value === undefined || value === '') return 'Sem valor definido';
    return String(value).replace('.', ',');
  }

  function openModal(goal = null) {
    form.reset();
    formError.textContent = '';
    document.getElementById('student-goal-id').value = goal?.id || '';
    document.getElementById('student-goal-type').value = goal?.goal_type || '';
    document.getElementById('student-goal-value').value = goal?.target_value ?? '';
    document.getElementById('student-goal-date').value = goal?.target_date ? String(goal.target_date).slice(0, 10) : '';
    document.getElementById('student-goal-status').value = goal?.status === 'completed' ? 'completed' : 'active';
    document.getElementById('student-goal-notes').value = goal?.notes || '';
    modalTitle.textContent = goal ? 'Editar meta' : 'Nova meta';
    saveButton.textContent = 'Salvar';
    modal.classList.remove('hidden');
    document.getElementById('student-goal-type').focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    formError.textContent = '';
  }

  function render(goals) {
    goalsById.clear();
    list.innerHTML = '';
    document.querySelector('.student-goals-panel')?.classList.toggle('is-single-goal', goals.length <= 1);
    goals.forEach((goal) => {
      goalsById.set(String(goal.id), goal);
      const isCompleted = goal.status === 'completed';
      const isActive = goal.status === 'active';
      const row = document.createElement('li');
      row.className = `student-goal-card${isCompleted ? ' is-completed' : ''}`;
      row.dataset.goalId = goal.id;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Editar meta ${goal.goal_type || ''}`.trim());
      row.innerHTML = `
        <div class="entity-main">
          <div style="display:inline-flex; align-items:center; gap:8px;">
            ${isCompleted ? '' : `<button type="button" class="status-toggle-dot ${isActive ? 'is-active' : 'is-inactive'}" data-goal-id="${StudentPortal.escapeHtml(goal.id)}" title="${isActive ? 'Meta ativa (clique para desativar)' : 'Meta desativada (clique para ativar)'}" aria-label="${isActive ? 'Meta ativa' : 'Meta desativada'}"></button>`}
            <strong>${StudentPortal.escapeHtml(goal.goal_type || 'Meta')}</strong>
            ${isCompleted ? '<span class="badge ok">Concluída</span>' : ''}
          </div>
          <span>Alvo: ${StudentPortal.escapeHtml(formatTarget(goal.target_value))} · Prazo: ${StudentPortal.escapeHtml(formatDate(goal.target_date))}</span>
          ${goal.notes ? `<span class="student-goal-notes">${StudentPortal.escapeHtml(goal.notes)}</span>` : ''}
        </div>
        <div class="student-feed-item-menu">
          <button class="student-feed-dots-btn student-goal-dots-btn" type="button" aria-label="Opções da meta ${StudentPortal.escapeHtml(goal.goal_type || '')}" title="Opções" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>
          </button>
          <div class="student-feed-item-dropdown hidden" role="menu">
            <button type="button" class="goal-item-edit-btn" data-goal-id="${StudentPortal.escapeHtml(goal.id)}" role="menuitem">Editar meta</button>
            <button type="button" class="goal-item-delete-btn is-danger" data-goal-id="${StudentPortal.escapeHtml(goal.id)}" role="menuitem">Excluir meta</button>
          </div>
        </div>`;

      const dot = row.querySelector('.status-toggle-dot');
      if (dot) {
        dot.addEventListener('click', async (e) => {
          e.stopPropagation();
          const nextStatus = isActive ? 'paused' : 'active';
          try {
            await StudentPortal.api(`/api/student/goals/${encodeURIComponent(goal.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: nextStatus })
            });
            await load();
          } catch (err) {
            alert(`Não foi possível atualizar o status da meta: ${err.message}`);
          }
        });
      }

      list.appendChild(row);
    });
    if (!goals.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma meta cadastrada ainda. Crie a primeira para começar seu acompanhamento.';
      list.appendChild(empty);
    }
  }

  async function load() {
    try {
      await StudentPortal.init();
      const response = await StudentPortal.api('/api/student/goals');
      render(Array.isArray(response.data) ? response.data : []);
      status.textContent = '';
      if (!handledNewGoalRequest && new URLSearchParams(window.location.search).get('new') === '1') {
        handledNewGoalRequest = true;
        window.history.replaceState({}, '', window.location.pathname);
        openModal();
      }
    } catch (error) {
      status.textContent = `Não foi possível carregar suas metas: ${error.message}`;
    }
  }

  async function save(event) {
    event.preventDefault();
    formError.textContent = '';
    saveButton.disabled = true;
    const id = document.getElementById('student-goal-id').value;
    const payload = {
      goal_type: document.getElementById('student-goal-type').value.trim(),
      target_value: document.getElementById('student-goal-value').value,
      target_date: document.getElementById('student-goal-date').value,
      status: document.getElementById('student-goal-status').value,
      notes: document.getElementById('student-goal-notes').value.trim()
    };
    try {
      await StudentPortal.api(id ? `/api/student/goals/${encodeURIComponent(id)}` : '/api/student/goals', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      closeModal();
      await load();
    } catch (error) {
      formError.textContent = `Não foi possível salvar a meta: ${error.message}`;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function remove(id) {
    if (!window.confirm('Excluir esta meta?')) return;
    try {
      await StudentPortal.api(`/api/student/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      status.textContent = `Não foi possível excluir a meta: ${error.message}`;
    }
  }

  function initGoalsMenu() {
    const trigger = document.getElementById('student-goals-menu-btn');
    const dropdown = document.getElementById('student-goals-dropdown');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => d.classList.add('hidden'));
      const isHidden = dropdown.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', String(!isHidden));
    });

    document.getElementById('student-menu-new-goal')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openModal();
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
      document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => {
        if (!d.contains(e.target) && !e.target.closest('.student-goal-dots-btn')) {
          d.classList.add('hidden');
        }
      });
      document.querySelectorAll('.student-goal-card.is-menu-open').forEach((c) => {
        if (!c.contains(e.target)) {
          c.classList.remove('is-menu-open');
        }
      });
    });
  }

  document.getElementById('student-goal-new')?.addEventListener('click', () => openModal());
  document.getElementById('student-goal-close').addEventListener('click', closeModal);
  document.getElementById('student-goal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  form.addEventListener('submit', save);
  list.addEventListener('click', (event) => {
    const dotsBtn = event.target.closest('.student-goal-dots-btn');
    if (dotsBtn) {
      event.stopPropagation();
      const card = dotsBtn.closest('.student-goal-card');
      const menu = dotsBtn.nextElementSibling;
      const willOpen = menu?.classList.contains('hidden');
      document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => {
        if (d !== menu) d.classList.add('hidden');
      });
      document.querySelectorAll('.student-goal-card.is-menu-open').forEach((c) => {
        if (c !== card) c.classList.remove('is-menu-open');
      });
      document.getElementById('student-goals-dropdown')?.classList.add('hidden');
      if (menu) {
        menu.classList.toggle('hidden', !willOpen);
        card?.classList.toggle('is-menu-open', willOpen);
      }
      return;
    }

    const editBtn = event.target.closest('.goal-item-edit-btn');
    if (editBtn) {
      event.stopPropagation();
      editBtn.closest('.student-feed-item-dropdown')?.classList.add('hidden');
      editBtn.closest('.student-goal-card')?.classList.remove('is-menu-open');
      const goal = goalsById.get(editBtn.dataset.goalId);
      if (goal) openModal(goal);
      return;
    }

    const deleteBtn = event.target.closest('.goal-item-delete-btn');
    if (deleteBtn) {
      event.stopPropagation();
      deleteBtn.closest('.student-feed-item-dropdown')?.classList.add('hidden');
      deleteBtn.closest('.student-goal-card')?.classList.remove('is-menu-open');
      const goal = goalsById.get(deleteBtn.dataset.goalId);
      if (goal) remove(goal.id);
      return;
    }

    if (event.target.closest('.student-feed-item-dropdown')) return;

    const card = event.target.closest('.student-goal-card');
    const goal = goalsById.get(card?.dataset.goalId);
    if (goal) openModal(goal);
  });
  list.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('.student-goal-card');
    const goal = goalsById.get(card?.dataset.goalId);
    if (!goal) return;
    event.preventDefault();
    openModal(goal);
  });

  initGoalsMenu();
  load();
}());
