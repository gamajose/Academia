(function () {
  const list = document.getElementById('student-goal-list');
  const status = document.getElementById('student-goals-status');
  list.classList.add('student-goal-list');
  async function load() {
    try {
      await StudentPortal.init();
      const data = await StudentPortal.api('/api/student/progress');
      list.innerHTML = '';
      (data.goals || []).forEach((item) => {
        const row = document.createElement('li'); row.className = 'entity-card student-goal-card';
        row.innerHTML = `<div class="entity-main"><strong>${StudentPortal.escapeHtml(item.goal_type || 'Meta')}</strong><span>Alvo: ${StudentPortal.escapeHtml(item.target_value ?? '-')} · Prazo: ${StudentPortal.escapeHtml(item.target_date || 'Sem prazo')}</span><span>${StudentPortal.escapeHtml(item.notes || '')}</span></div><span class="badge ${item.status === 'active' ? 'ok' : ''}">${StudentPortal.escapeHtml(item.status === 'active' ? 'Ativa' : item.status || 'Em andamento')}</span>`;
        list.appendChild(row);
      });
      if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhuma meta cadastrada ainda.'; list.appendChild(empty); }
    } catch (error) { status.textContent = `Erro: ${error.message}`; }
  }
  load();
}());
