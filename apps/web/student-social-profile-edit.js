(function () {
  const p = (id) => document.getElementById(id);
  const accountFields = ['name', 'birth_date', 'cpf', 'rg', 'email', 'phone', 'postal_code', 'street', 'address_number', 'neighborhood', 'city', 'state', 'objective', 'allergies', 'notes'];
  let photoPreview = '';
  let currentPhoto = '';

  function setStatus(message, error = false, id = 'social-profile-status') {
    const element = p(id);
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('error', error);
  }

  function setAvatar(profile) {
    const host = p('social-edit-avatar');
    host.replaceChildren();
    if (profile.profile_photo_url) {
      const image = document.createElement('img');
      image.src = profile.profile_photo_url;
      image.alt = '';
      host.appendChild(image);
    } else {
      host.textContent = String(profile.name || 'A').trim().charAt(0).toUpperCase();
    }
  }

  function showView(view) {
    document.querySelectorAll('[data-settings-view-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.settingsViewPanel !== view;
    });
    document.querySelectorAll('[data-settings-view]').forEach((link) => {
      const active = link.dataset.settingsView === view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setupViewNavigation() {
    document.querySelectorAll('[data-settings-view]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        showView(link.dataset.settingsView);
      });
    });
    const initialView = { '#social-account': 'account', '#social-language': 'language', '#social-theme': 'theme', '#social-security': 'security' }[window.location.hash] || 'profile';
    showView(initialView);
  }

  function fillAccount(data) {
    accountFields.forEach((field) => {
      const element = p(`profile-${field.replaceAll('_', '-')}`);
      if (element) element.value = data[field] || data[`account_${field}`] || '';
    });
  }

  async function uploadPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG ou WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A foto não pode ultrapassar 5 MB.');
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await fetch(`${StudentPortal.apiBase}/api/editor/images`, { method: 'POST', headers: { Authorization: `Bearer ${StudentPortal.getToken()}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a foto.');
    return data.location || '';
  }

  function socialPayload(photo = currentPhoto) {
    return {
      name: p('social-profile-name').value.trim(),
      bio: p('social-profile-bio').value.trim(),
      website_url: p('social-profile-link').value.trim(),
      profile_photo_url: photo,
      is_private: p('social-profile-private').checked,
      weight_unit: 'kg',
      distance_unit: 'km',
      theme: p('social-profile-theme').value,
      language: p('social-profile-language').value
    };
  }

  async function persistSocialProfile(button, statusId) {
    button.disabled = true;
    let photo = currentPhoto;
    const file = p('social-profile-photo-file').files?.[0];
    if (file) photo = await uploadPhoto(file);
    const result = await StudentPortal.api('/api/student/social/profile', { method: 'POST', body: JSON.stringify(socialPayload(photo)) });
    currentPhoto = result.profile.profile_photo_url || photo;
    setAvatar(result.profile);
    localStorage.setItem('studentName', result.profile.name);
    document.querySelectorAll('[data-student-name]').forEach((element) => { element.textContent = result.profile.name; });
    setStatus(statusId === 'social-language-status' ? 'Idioma salvo.' : statusId === 'social-theme-status' ? 'Tema salvo.' : 'Perfil atualizado.', false, statusId);
    return result;
  }

  async function load() {
    try {
      await StudentPortal.init();
      const [socialResult, account] = await Promise.all([
        StudentPortal.api('/api/student/social/profile'),
        StudentPortal.api('/api/student/profile')
      ]);
      const profile = socialResult.profile;
      currentPhoto = profile.profile_photo_url || '';
      p('social-profile-name').value = profile.name || '';
      p('social-profile-bio').value = profile.bio || '';
      p('social-profile-link').value = profile.website_url || '';
      p('social-profile-private').checked = Boolean(profile.is_private);
      p('social-profile-language').value = profile.language || 'pt-BR';
      p('social-profile-theme').value = profile.theme || 'light';
      StudentPortal.setLocale(profile.language || 'pt-BR');
      StudentPortal.applyTheme(profile.theme || 'light');
      fillAccount(account);
      setAvatar(profile);
    } catch (error) {
      setStatus(`Não foi possível carregar seus dados: ${error.message}`, true);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    try {
      await persistSocialProfile(button, 'social-profile-status');
      window.location.href = './student-social-profile.html';
    } catch (error) {
      setStatus(`Não foi possível salvar: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  async function savePreference(event, statusId, preference) {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    try {
      if (preference === 'language') StudentPortal.setLocale(p('social-profile-language').value);
      if (preference === 'theme') StudentPortal.applyTheme(p('social-profile-theme').value);
      await persistSocialProfile(button, statusId);
    } catch (error) {
      setStatus(`Não foi possível salvar: ${error.message}`, true, statusId);
    } finally {
      button.disabled = false;
    }
  }

  async function saveSecurity(event) {
    event.preventDefault();
    const button = p('student-security-button');
    const status = p('student-security-status');
    const current = p('current-password').value;
    const next = p('new-password').value;
    const confirmation = p('password-confirmation').value;
    if (next !== confirmation) { status.textContent = 'As novas senhas não conferem.'; return; }
    try {
      button.disabled = true;
      button.textContent = 'Salvando...';
      await StudentPortal.api('/api/student/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next, password_confirmation: confirmation }) });
      localStorage.setItem('studentMustChangePassword', 'false');
      p('student-security-form').reset();
      status.textContent = 'Senha atualizada com sucesso.';
    } catch (error) {
      const messages = { senha_atual_invalida: 'A senha atual não confere.', senha_muito_curta: 'Use 8 caracteres, 1 letra maiúscula e 1 número.', senhas_nao_conferem: 'As novas senhas não conferem.' };
      status.textContent = messages[error.message] || `Erro: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Atualizar senha';
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    const button = p('student-profile-save');
    const payload = {};
    accountFields.forEach((field) => {
      const element = p(`profile-${field.replaceAll('_', '-')}`);
      if (element) payload[field] = element.value.trim();
    });
    try {
      button.disabled = true;
      button.textContent = 'Salvando...';
      await StudentPortal.api('/api/student/profile', { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('studentName', payload.name);
      document.querySelectorAll('[data-student-name]').forEach((element) => { element.textContent = payload.name; });
      setStatus('Dados da conta atualizados.', false, 'student-profile-status');
    } catch (error) {
      const messages = { email_ja_cadastrado: 'Esse e-mail já está vinculado a outra conta.', email_invalido: 'Informe um e-mail válido.', nome_invalido: 'Informe seu nome completo.' };
      setStatus(messages[error.message] || `Não foi possível salvar: ${error.message}`, true, 'student-profile-status');
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }

  function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

  async function exportData() {
    const button = p('social-export-data');
    try {
      button.setAttribute('aria-disabled', 'true');
      const [account, social, progress, logs, checkins] = await Promise.all([StudentPortal.api('/api/student/profile'), StudentPortal.api('/api/student/social/profile'), StudentPortal.api('/api/student/progress'), StudentPortal.api('/api/student/training/logs'), StudentPortal.api('/api/student/checkins?limit=200')]);
      const rows = [['conta', '', account.name, account.email, account.phone], ...(social.posts || []).map((post) => ['publicacao', post.created_at, social.profile.name, post.caption || '', post.media_url || '']), ...(progress.goals || []).map((goal) => ['meta', goal.target_date, goal.type || '', goal.target_value || '', goal.status || '']), ...(progress.assessments || []).map((assessment) => ['avaliacao', assessment.assessment_date, '', assessment.weight_kg || '', assessment.notes || '']), ...(logs.data || []).map((log) => ['treino', log.completed_at, log.plan_name || '', log.status || '', log.feedback || '']), ...(checkins.data || []).map((checkin) => ['checkin', checkin.checked_at, '', checkin.source || '', checkin.access_status || ''])];
      const csv = ['tipo,data,nome,valor,detalhes', ...rows.map((row) => row.map(csvCell).join(','))].join('\n') + '\n';
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `bluerec-dados-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Dados exportados em CSV.');
    } catch (error) {
      setStatus(`Não foi possível exportar seus dados: ${error.message}`, true);
    } finally {
      button.removeAttribute('aria-disabled');
    }
  }

  setupViewNavigation();
  p('social-profile-form').addEventListener('submit', saveProfile);
  p('student-profile-form').addEventListener('submit', saveAccount);
  p('social-language-form').addEventListener('submit', (event) => savePreference(event, 'social-language-status', 'language'));
  p('social-theme-form').addEventListener('submit', (event) => savePreference(event, 'social-theme-status', 'theme'));
  p('student-security-form').addEventListener('submit', saveSecurity);
  p('social-export-data')?.addEventListener('click', (event) => { event.preventDefault(); exportData(); });
  p('social-profile-language').addEventListener('change', (event) => StudentPortal.setLocale(event.target.value));
  p('social-profile-theme').addEventListener('change', (event) => StudentPortal.applyTheme(event.target.value));
  p('social-profile-photo-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) return;
    photoPreview = URL.createObjectURL(file);
    const image = document.createElement('img');
    image.src = photoPreview;
    image.alt = '';
    p('social-edit-avatar').replaceChildren(image);
  });
  p('social-edit-avatar').addEventListener('click', () => p('social-profile-photo-file').click());
  p('social-edit-avatar').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); p('social-profile-photo-file').click(); } });
  load();
}());
