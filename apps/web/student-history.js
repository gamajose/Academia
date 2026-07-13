(function () {
  const list = document.getElementById('student-log-list'); const status = document.getElementById('student-history-status');
  async function load() {
    try { await StudentPortal.init(); const result = await StudentPortal.api('/api/student/training/logs'); list.innerHTML = ''; (result.data || []).forEach((item) => { const row = document.createElement('li'); row.className = 'entity-card'; row.innerHTML = `<div class="entity-main"><strong>${StudentPortal.escapeHtml(item.day_title || item.plan_name || 'Treino concluído')}</strong><span>${StudentPortal.escapeHtml(new Date(item.completed_at).toLocaleString('pt-BR'))}</span><span>Esforço percebido: ${StudentPortal.escapeHtml(item.perceived_effort ?? '-')}</span><span>${StudentPortal.escapeHtml(item.feedback || '')}</span></div><span class="badge ok">Concluído</span>`; list.appendChild(row); }); if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhum treino concluído ainda.'; list.appendChild(empty); } status.textContent = 'Histórico carregado.'; } catch (error) { status.textContent = `Erro: ${error.message}`; }
  }
  load();
}());
