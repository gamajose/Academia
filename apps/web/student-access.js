(function () {
  const get = (id) => document.getElementById(id);
  let expiresAt = null;
  let refreshTimer = null;
  let countdownTimer = null;
  let loading = false;

  function setText(id, value) { const element = get(id); if (element) element.textContent = value; }

  function setAccessState(access) {
    const allowed = access?.allowed === true;
    const badge = get('student-access-badge');
    badge.textContent = allowed ? 'Liberado' : 'Bloqueado';
    badge.className = `badge ${allowed ? 'ok' : 'bad'}`;
    setText('student-access-status', allowed ? 'Pagamento e matrícula conferidos. Seu acesso está pronto.' : (access?.message || 'Seu acesso está bloqueado no momento.'));
  }

  function updateCountdown() {
    const seconds = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) : 0;
    setText('student-access-countdown', expiresAt ? `Atualiza em ${seconds} segundo(s)` : 'QR Code temporário indisponível');
    if (expiresAt && seconds <= 2 && !loading) void loadCredential(true);
  }

  async function loadCredential(silent = false) {
    if (loading) return;
    loading = true;
    if (!silent) setText('student-access-status', 'Gerando seu QR Code...');
    try {
      const result = await StudentPortal.api('/api/student/access/credential', { method: 'POST', body: JSON.stringify({}) });
      setAccessState(result.access);
      const qr = get('student-access-qr');
      const empty = get('student-access-qr-empty');
      if (result.generated && result.qr_data_url) { qr.src = result.qr_data_url; qr.hidden = false; empty.hidden = true; }
      else { qr.removeAttribute('src'); qr.hidden = true; empty.hidden = false; empty.textContent = result.access?.message || 'QR Code indisponível'; }
      setText('student-access-code', result.generated ? String(result.access_code || '--- ---').replace(/(.{3})(?=\S)/, '$1 ') : '--- ---');
      expiresAt = result.expires_at ? new Date(result.expires_at) : null;
      updateCountdown();
    } catch (error) { setText('student-access-page-status', `Não foi possível gerar o QR Code: ${error.message}`); }
    finally { loading = false; }
  }

  async function loadOfflineCredential() {
    try {
      const result = await StudentPortal.api('/api/student/access/offline-credential');
      setText('student-access-registration', result.registration_number || '------');
      setText('student-access-pin', result.offline_pin || '----');
      if (!get('student-access-status').textContent || get('student-access-status').textContent === 'Verificando seu acesso...') setAccessState(result.access);
    } catch (error) { setText('student-access-page-status', `Não foi possível carregar sua matrícula e PIN: ${error.message}`); }
  }

  async function load() {
    try { if (!await StudentPortal.init()) return; await Promise.all([loadCredential(), loadOfflineCredential()]); }
    catch (error) { setText('student-access-page-status', `Erro: ${error.message}`); }
    refreshTimer = window.setInterval(() => loadCredential(true), 25000);
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  get('student-access-refresh')?.addEventListener('click', () => loadCredential());
  load();
}());
