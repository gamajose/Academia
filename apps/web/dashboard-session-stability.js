(() => {
  const originalLogout = typeof window.logout === 'function' ? window.logout : null;

  function apiBase() {
    const host = window.location.hostname || 'localhost';
    return (localStorage.getItem('apiBaseUrl') || `http://${host}:3004`).replace(/\/$/, '');
  }

  function showTemporaryFailure() {
    const text = 'Não foi possível carregar todos os dados agora. Sua sessão foi mantida e o painel tentará novamente automaticamente.';
    const actionMessage = document.getElementById('action-message');
    const syncStatus = document.getElementById('dashboard-sync-status');
    if (actionMessage) actionMessage.textContent = text;
    if (syncStatus) syncStatus.textContent = 'Falha temporária na atualização. Nova tentativa em instantes.';
  }

  async function tokenIsInvalid() {
    const token = localStorage.getItem('academiaToken') || '';
    if (!token) return true;

    try {
      const response = await fetch(`${apiBase()}/api/me`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.status === 401;
    } catch (_) {
      return false;
    }
  }

  window.logout = async function stableDashboardLogout() {
    if (await tokenIsInvalid()) {
      if (originalLogout) return originalLogout();
      localStorage.removeItem('academiaToken');
      window.location.href = './student-login.html';
      return;
    }

    showTemporaryFailure();
  };
})();
