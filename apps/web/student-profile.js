(function () {
  const p = (id) => document.getElementById(id);
  const fields = ['name', 'birth_date', 'cpf', 'rg', 'email', 'phone', 'postal_code', 'street', 'address_number', 'neighborhood', 'city', 'state', 'objective', 'allergies', 'notes'];
  let currentProfileData = null;

  function text(val) { return StudentPortal.escapeHtml(val == null ? '' : String(val)); }

  function updateAvatarDisplay(photoUrl, name) {
    const photoEl = p('profile-view-photo');
    const initialEl = p('profile-view-initial');
    const initialChar = (name || 'A').trim().charAt(0).toUpperCase() || 'A';

    if (photoUrl) {
      if (photoEl) {
        photoEl.src = photoUrl;
        photoEl.classList.remove('hidden');
        photoEl.style.display = 'block';
      }
      if (initialEl) {
        initialEl.classList.add('hidden');
        initialEl.style.display = 'none';
        initialEl.textContent = '';
      }
      document.querySelectorAll('[data-student-avatar]').forEach((el) => {
        el.innerHTML = `<img src="${photoUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      });
    } else {
      if (photoEl) {
        photoEl.src = '';
        photoEl.classList.add('hidden');
        photoEl.style.display = 'none';
      }
      if (initialEl) {
        initialEl.textContent = initialChar;
        initialEl.classList.remove('hidden');
        initialEl.style.display = 'flex';
      }
      document.querySelectorAll('[data-student-avatar]').forEach((el) => {
        el.textContent = initialChar;
      });
    }
  }

  function fillView(data) {
    currentProfileData = data;
    const name = data.name || 'Aluno';
    p('profile-view-name').textContent = name;
    localStorage.setItem('studentName', name);
    document.querySelectorAll('[data-student-name]').forEach((el) => { el.textContent = name; });

    updateAvatarDisplay(data.photo_url, name);

    const email = data.email || data.account_email || '';
    const emailBadge = p('profile-view-email-badge');
    if (emailBadge) {
      emailBadge.textContent = email;
      emailBadge.hidden = !email;
    }

    const bio = (data.notes || data.objective || '').trim();
    const bioEl = p('profile-view-bio');
    if (bioEl) {
      bioEl.textContent = bio || 'Sem bio cadastrada. Toque em Editar perfil para adicionar uma descrição sobre você.';
      bioEl.classList.toggle('is-empty', !bio);
    }

    const contactParts = [data.phone, email].filter(Boolean);
    p('profile-view-contact').textContent = contactParts.length ? contactParts.join(' · ') : 'Não informado';

    const locationParts = [data.city, data.state].filter(Boolean);
    p('profile-view-location').textContent = locationParts.length ? locationParts.join(' - ') : (data.neighborhood || 'Brasil');

    p('profile-view-objective').textContent = data.objective || 'Manter saúde e condicionamento';
    p('profile-view-allergies').textContent = data.allergies || 'Nenhuma restrição informada';
  }

  function fillForm(data) {
    fields.forEach((field) => {
      const el = p(`profile-${field.replaceAll('_', '-')}`);
      if (el) el.value = data[field] || data[`account_${field}`] || '';
    });
  }

  const profileTabs = ['personal', 'bio', 'contact', 'address'];

  function switchProfileModalTab(targetTab) {
    profileTabs.forEach((tab) => {
      const btn = p(`profile-tab-btn-${tab}`);
      const pane = p(`profile-panel-${tab}`);
      const isActive = tab === targetTab;
      if (btn) {
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      }
      if (pane) {
        pane.classList.toggle('hidden', !isActive);
      }
    });
  }

  function initProfileTabs() {
    profileTabs.forEach((tab) => {
      p(`profile-tab-btn-${tab}`)?.addEventListener('click', () => switchProfileModalTab(tab));
    });
  }

  function openProfileModal() {
    if (currentProfileData) fillForm(currentProfileData);
    switchProfileModalTab('personal');
    p('student-profile-form-status').textContent = '';
    p('student-profile-modal')?.classList.remove('hidden');
    setTimeout(() => p('profile-name')?.focus(), 50);
  }

  function closeProfileModal() {
    p('student-profile-modal')?.classList.add('hidden');
    p('student-profile-form-status').textContent = '';
  }

  function openPasswordModal() {
    p('student-password-form')?.reset();
    p('student-password-status').textContent = '';
    p('student-password-modal')?.classList.remove('hidden');
    setTimeout(() => p('password-current')?.focus(), 50);
  }

  function closePasswordModal() {
    p('student-password-modal')?.classList.add('hidden');
    p('student-password-status').textContent = '';
  }

  async function handlePhotoUpload(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('Formato inválido. Escolha JPG, PNG, GIF ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('A foto não pode ultrapassar 5 MB.');
      return;
    }

    const statusEl = p('student-profile-status');
    try {
      statusEl.textContent = 'Enviando foto de perfil...';
      const form = new FormData();
      form.append('file', file, file.name);

      const res = await fetch(`${StudentPortal.apiBase}/api/editor/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${StudentPortal.token}` },
        body: form
      });
      const uploadData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(uploadData.error || 'Falha no envio da imagem.');

      const photoUrl = uploadData.location || '';
      if (!photoUrl) throw new Error('URL da foto não gerada.');

      // Save into profile
      const updated = await StudentPortal.api('/api/student/profile', {
        method: 'POST',
        body: JSON.stringify({
          ...(currentProfileData || {}),
          name: currentProfileData?.name || p('profile-name')?.value || 'Aluno',
          email: currentProfileData?.email || p('profile-email')?.value || '',
          photo_url: photoUrl
        })
      });

      fillView(updated);
      statusEl.textContent = 'Foto de perfil atualizada com sucesso!';
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    } catch (err) {
      statusEl.textContent = `Erro ao salvar foto: ${err.message}`;
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = p('student-profile-save');
    const formStatus = p('student-profile-form-status');
    const payload = {};
    fields.forEach((field) => {
      const element = p(`profile-${field.replaceAll('_', '-')}`);
      if (element) payload[field] = element.value.trim();
    });

    if (currentProfileData?.photo_url) {
      payload.photo_url = currentProfileData.photo_url;
    }

    try {
      button.disabled = true;
      button.textContent = 'Salvando...';
      formStatus.textContent = '';

      const updated = await StudentPortal.api('/api/student/profile', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      fillView(updated);
      closeProfileModal();
      p('student-profile-status').textContent = 'Perfil atualizado com sucesso.';
      setTimeout(() => { p('student-profile-status').textContent = ''; }, 4000);
    } catch (error) {
      const messages = {
        email_ja_cadastrado: 'Esse e-mail já está vinculado a outra conta.',
        email_invalido: 'Informe um e-mail válido.',
        nome_invalido: 'Informe seu nome completo.'
      };
      formStatus.textContent = messages[error.message] || `Erro: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    const button = p('student-password-submit');
    const status = p('student-password-status');
    const current = p('password-current').value;
    const next = p('password-next').value;
    const confirmation = p('password-confirm').value;

    if (next !== confirmation) {
      status.textContent = 'As novas senhas não conferem.';
      return;
    }

    try {
      button.disabled = true;
      button.textContent = 'Salvando...';
      await StudentPortal.api('/api/student/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next, password_confirmation: confirmation })
      });
      localStorage.setItem('studentMustChangePassword', 'false');
      p('student-password-form').reset();
      status.textContent = 'Senha atualizada com sucesso.';
      setTimeout(() => {
        closePasswordModal();
        p('student-profile-status').textContent = 'Senha atualizada com sucesso!';
      }, 1200);
    } catch (error) {
      const messages = {
        senha_atual_invalida: 'A senha atual não confere.',
        senha_muito_curta: 'Use 8 caracteres, 1 letra maiúscula e 1 número.',
        senhas_nao_conferem: 'As novas senhas não conferem.'
      };
      status.textContent = messages[error.message] || `Erro: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Atualizar senha';
    }
  }

  function initProfileMenu() {
    const trigger = p('student-profile-menu-btn');
    const dropdown = p('student-profile-dropdown-menu');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdown.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', String(!isHidden));
    });

    p('student-menu-edit-profile')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openProfileModal();
    });

    p('student-menu-change-photo')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      p('profile-photo-input')?.click();
    });

    p('student-menu-change-password')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openPasswordModal();
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function load() {
    try {
      await StudentPortal.init();
      const data = await StudentPortal.api('/api/student/profile');
      fillView(data);
      fillForm(data);
      p('student-profile-status').textContent = '';

      if (new URLSearchParams(window.location.search).get('action') === 'password') {
        openPasswordModal();
      }
    } catch (error) {
      p('student-profile-status').textContent = `Erro: ${error.message}`;
    }
  }

  // Event wiring
  p('student-profile-avatar-trigger')?.addEventListener('click', () => p('profile-photo-input')?.click());
  p('student-profile-avatar-trigger')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p('profile-photo-input')?.click(); }
  });
  p('profile-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoUpload(file);
  });

  p('student-quick-edit-btn')?.addEventListener('click', openProfileModal);
  p('student-quick-password-btn')?.addEventListener('click', openPasswordModal);
  p('profile-open-password-btn')?.addEventListener('click', () => {
    closeProfileModal();
    openPasswordModal();
  });

  p('student-profile-close')?.addEventListener('click', closeProfileModal);
  p('student-profile-cancel')?.addEventListener('click', closeProfileModal);
  p('student-profile-modal')?.addEventListener('click', (e) => {
    if (e.target === p('student-profile-modal')) closeProfileModal();
  });

  p('student-password-close')?.addEventListener('click', closePasswordModal);
  p('student-password-cancel')?.addEventListener('click', closePasswordModal);
  p('student-password-modal')?.addEventListener('click', (e) => {
    if (e.target === p('student-password-modal')) closePasswordModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!p('student-profile-modal')?.classList.contains('hidden')) closeProfileModal();
      if (!p('student-password-modal')?.classList.contains('hidden')) closePasswordModal();
    }
  });

  p('student-profile-form')?.addEventListener('submit', saveProfile);
  p('student-password-form')?.addEventListener('submit', savePassword);

  initProfileMenu();
  initProfileTabs();
  load();
}());
