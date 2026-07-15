(function () {
  const list = document.getElementById('student-goal-list');
  const status = document.getElementById('student-goals-status');
  const modal = document.getElementById('student-goal-modal');
  const form = document.getElementById('student-goal-form');
  const modalTitle = document.getElementById('student-goal-modal-title');
  const formError = document.getElementById('student-goal-form-error');
  const saveButton = document.getElementById('student-goal-save');
  const goalsById = new Map();

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
      const row = document.createElement('li');
      row.className = `student-goal-card${goal.status === 'completed' ? ' is-completed' : ''}`;
      row.dataset.goalId = goal.id;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Editar meta ${goal.goal_type || ''}`.trim());
      row.innerHTML = `
        <div class="entity-main">
          <strong>${StudentPortal.escapeHtml(goal.goal_type || 'Meta')}</strong>
          <span>Alvo: ${StudentPortal.escapeHtml(formatTarget(goal.target_value))} · Prazo: ${StudentPortal.escapeHtml(formatDate(goal.target_date))}</span>
          ${goal.notes ? `<span class="student-goal-notes">${StudentPortal.escapeHtml(goal.notes)}</span>` : ''}
          <span class="badge ${goal.status === 'active' ? 'ok' : ''}">${goal.status === 'completed' ? 'Concluída' : 'Ativa'}</span>
        </div>
        <div class="student-goal-actions">
          <button class="student-goal-action" type="button" data-goal-action="edit" data-goal-id="${StudentPortal.escapeHtml(goal.id)}" aria-label="Editar meta" title="Editar meta">${icon('edit')}</button>
          <button class="student-goal-action is-danger" type="button" data-goal-action="delete" data-goal-id="${StudentPortal.escapeHtml(goal.id)}" aria-label="Excluir meta" title="Excluir meta">${icon('trash')}</button>
        </div>`;
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

  document.getElementById('student-goal-new').addEventListener('click', () => openModal());
  document.getElementById('student-goal-close').addEventListener('click', closeModal);
  document.getElementById('student-goal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
  form.addEventListener('submit', save);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goal-action]');
    const card = event.target.closest('.student-goal-card');
    const goal = goalsById.get(button?.dataset.goalId || card?.dataset.goalId);
    if (!goal) return;
    if (button?.dataset.goalAction === 'edit' || !button) openModal(goal);
    if (button?.dataset.goalAction === 'delete') remove(goal.id);
  });
  list.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
    const card = event.target.closest('.student-goal-card');
    const goal = goalsById.get(card?.dataset.goalId);
    if (!goal) return;
    event.preventDefault();
    openModal(goal);
  });

  load();
}());
