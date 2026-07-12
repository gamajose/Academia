(() => {
  const status = document.getElementById('dashboard-sync-status');
  let busy = false;

  async function sync() {
    if (busy || typeof refreshDashboard !== 'function') return;
    busy = true;
    try {
      await refreshDashboard();
      if (status) status.textContent = `Atualizado automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    } catch (_) {
      // Mantém a interface limpa e tenta novamente no próximo ciclo automático.
    } finally {
      busy = false;
    }
  }

  window.setInterval(sync, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
})();
