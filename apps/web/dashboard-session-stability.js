(() => {
  const originalLogout = typeof window.logout === 'function' ? window.logout : null;

  function apiBase() {
    const host = window.location.hostname || 'localhost';
    return (localStorage.getItem('apiBaseUrl') || `http://${host}:3004`).replace(/\/$/, '');
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
    }
  };
})();
