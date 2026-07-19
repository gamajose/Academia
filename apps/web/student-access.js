(function () {
  const get = (id) => document.getElementById(id);
  let expiresAt = null;
  let refreshTimer = null;
  let countdownTimer = null;
  let loading = false;

  function setText(id, value) {
    const element = get(id);
    if (element) element.textContent = value;
  }

  function setAccessState(access) {
    const allowed = access?.allowed === true;
    const badge = get('student-access-badge');
    if (badge) {
      badge.textContent = allowed ? 'Liberado' : 'Bloqueado';
      badge.className = `badge ${allowed ? 'ok' : 'bad'}`;
    }
  }

  function updateCountdown() {
    const seconds = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) : 0;
    setText('student-access-countdown', expiresAt ? `Atualiza em ${seconds} segundo(s)` : 'QR Code temporário indisponível');
    if (expiresAt && seconds <= 2 && !loading) void loadCredential(true);
  }

  async function loadCredential(silent = false) {
    if (loading) return;
    loading = true;
    try {
      const result = await StudentPortal.api('/api/student/access/credential', { method: 'POST', body: JSON.stringify({}) });
      setAccessState(result.access);
      const qr = get('student-access-qr');
      const empty = get('student-access-qr-empty');
      if (result.generated && result.qr_data_url) {
        qr.src = result.qr_data_url;
        qr.hidden = false;
        empty.hidden = true;
      } else {
        qr.removeAttribute('src');
        qr.hidden = true;
        empty.hidden = false;
        empty.textContent = result.access?.message || 'QR Code indisponível';
      }
      setText('student-access-code', result.generated ? String(result.access_code || '--- ---').replace(/(.{3})(?=\S)/, '$1 ') : '--- ---');
      expiresAt = result.expires_at ? new Date(result.expires_at) : null;
      updateCountdown();
      setText('student-access-page-status', '');
    } catch (error) {
      setText('student-access-page-status', `Não foi possível gerar o QR Code: ${error.message}`);
      setText('student-access-countdown', 'QR Code temporário indisponível');
    } finally {
      loading = false;
    }
  }

  async function loadOfflineCredential() {
    try {
      const result = await StudentPortal.api('/api/student/access/offline-credential');
      setText('student-access-registration', result.registration_number || '------');
      setText('student-access-pin', result.offline_pin || '----');
      setAccessState(result.access);
      setText('student-access-page-status', '');
    } catch (error) {
      setText('student-access-page-status', `Não foi possível carregar sua matrícula e PIN: ${error.message}`);
    }
  }

  async function load() {
    try {
      const session = await StudentPortal.init();
      if (!session) return;
      await Promise.all([loadCredential(), loadOfflineCredential()]);
      refreshTimer = window.setInterval(() => loadCredential(true), 25000);
      countdownTimer = window.setInterval(updateCountdown, 1000);
    } catch (error) {
      setText('student-access-page-status', `Não foi possível carregar seu acesso: ${error.message}`);
    }
  }

  get('student-access-refresh')?.addEventListener('click', () => loadCredential());
  window.addEventListener('pagehide', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
    if (countdownTimer) window.clearInterval(countdownTimer);
  });
  load();
}());
