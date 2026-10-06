const ACCOUNT_HOST = window.location.hostname || 'localhost';
const ACCOUNT_API = localStorage.getItem('apiBaseUrl') || `http://${ACCOUNT_HOST}:3004`;
const ACCOUNT_TOKEN = localStorage.getItem('academiaToken') || '';
const account = (id) => document.getElementById(id);

async function accountApi(path, options = {}) {
  const response = await fetch(`${ACCOUNT_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCOUNT_TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }
function value(id) { return account(id)?.value?.trim() || ''; }
function fill(id, text) { const el = account(id); if (el) el.value = text || ''; }

function renderProfilePhoto(url, name) {
  const host = account('profile-photo-button');
  if (!host) return;
  host.replaceChildren();
  host.dataset.photoUrl = url || '';
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.onerror = () => {
      host.textContent = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
    };
    host.appendChild(image);
  } else {
    host.textContent = String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }
}

function roleText(profile, role) {
  if (role === 'owner') return 'Proprietário · acesso total';
  if (role === 'admin') return 'Administrador · gestão da academia';
  if (profile === 'trainer') return 'Personal trainer · treinos e evolução';
  if (profile === 'operator') return 'Operação · controle de acesso';
  return 'Recepção · atendimento e cadastros';
}

function switchTab(tabKey) {
  const tabs = [
    { key: 'personal', btn: 'tab-btn-personal', panel: 'panel-personal' },
    { key: 'address', btn: 'tab-btn-address', panel: 'panel-address' },
    { key: 'gym', btn: 'tab-btn-gym', panel: 'panel-gym' },
    { key: 'security', btn: 'tab-btn-security', panel: 'panel-security' }
  ];

  tabs.forEach(({ key, btn, panel }) => {
    const b = account(btn);
    const p = account(panel);
    const isActive = key === tabKey;
    if (b) {
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    }
    if (p) {
      p.classList.toggle('hidden', !isActive);
    }
  });
}

function initTabs() {
  account('tab-btn-personal')?.addEventListener('click', () => switchTab('personal'));
  account('tab-btn-address')?.addEventListener('click', () => switchTab('address'));
  account('tab-btn-gym')?.addEventListener('click', () => switchTab('gym'));
  account('tab-btn-security')?.addEventListener('click', () => switchTab('security'));

  const hash = window.location.hash.toLowerCase();
  if (hash === '#endereco') switchTab('address');
  else if (hash === '#empresa') switchTab('gym');
  else if (hash === '#seguranca' || hash === '#segurança') switchTab('security');
}

function renderProfile(user) {
  const name = user.name || 'Meu perfil';
  fill('profile-name', user.name);
  fill('profile-email', user.email);
  fill('profile-phone', user.phone);
  fill('profile-cpf', user.cpf);
  fill('profile-rg', user.rg);
  fill('profile-birth', user.birth_date ? String(user.birth_date).slice(0, 10) : '');
  const jobLabel = user.job_title || roleText(user.access_profile, user.role);
  fill('profile-job-title', jobLabel);

  if (account('profile-display-name')) account('profile-display-name').textContent = name;
  if (account('profile-display-email')) account('profile-display-email').textContent = user.email || '-';
  if (account('profile-access-badge')) {
    account('profile-access-badge').textContent = user.access_profile_name || roleText(user.access_profile, user.role);
  }

  renderProfilePhoto(user.profile_photo_url, name);

  const address = user.address_details || {};
  fill('profile-postal-code', address.postal_code);
  fill('profile-street', address.street);
  const numVal = address.number || '';
  fill('profile-address-number', numVal);
  const noNumCb = account('profile-no-number');
  if (noNumCb) {
    if (numVal.toUpperCase() === 'S/N' || numVal.toLowerCase() === 'sem número') {
      noNumCb.checked = true;
      if (account('profile-address-number')) account('profile-address-number').disabled = true;
    } else {
      noNumCb.checked = false;
      if (account('profile-address-number')) account('profile-address-number').disabled = false;
    }
  }
  fill('profile-address-complement', address.complement);
  fill('profile-neighborhood', address.neighborhood);
  fill('profile-city', address.city);
  fill('profile-state', address.state);
  fill('profile-country', address.country || 'Brasil');

  const phone = digits(user.phone);
  const whatsapp = account('profile-whatsapp');
  if (whatsapp) {
    if (phone) {
      whatsapp.href = `https://wa.me/${phone}`;
      whatsapp.classList.remove('hidden');
    } else {
      whatsapp.classList.add('hidden');
    }
  }
}

async function uploadProfilePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto não pode ultrapassar 5 MB.');
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch(`${ACCOUNT_API}/api/editor/images`, { method: 'POST', headers: { Authorization: `Bearer ${ACCOUNT_TOKEN}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a foto.');
  return data.location || '';
}

async function loadProfile() {
  try {
    const user = await accountApi('/api/me');
    renderProfile(user);
    localStorage.setItem('academiaUserName', user.name || 'Meu perfil');
    localStorage.setItem('academiaRole', user.role || '');
    localStorage.setItem('academiaAccessProfile', user.access_profile || '');

    const canManageGym = ['owner', 'admin'].includes(user.role);
    const gymTabBtn = account('tab-btn-gym');
    if (gymTabBtn) gymTabBtn.classList.toggle('hidden', !canManageGym);

    await loadGym(canManageGym);

    if (new URLSearchParams(window.location.search).get('view') === 'preferences') {
      if (typeof openGlobalPreferencesModal === 'function') {
        openGlobalPreferencesModal();
      }
    }
  } catch (error) {
    if (account('profile-status')) account('profile-status').textContent = `Erro ao carregar perfil: ${error.message}`;
  }
}

async function loadGym(canManageGym) {
  if (!canManageGym) return;
  try {
    const gym = await accountApi('/api/gym/profile');
    fill('gym-name', gym.name);
    fill('gym-email', gym.email);
    fill('gym-phone', gym.phone);
    fill('gym-document', gym.document_number);
    fill('gym-address', gym.address);
    fill('gym-timezone', gym.timezone);
    fill('gym-pix-key', gym.pix_key);
    if (gym.logo_url) {
      const preview = account('gym-logo-preview');
      if (preview) {
        preview.src = gym.logo_url;
        preview.dataset.logoUrl = gym.logo_url;
      }
    }
    localStorage.setItem('gymLogoUrl', gym.logo_url || '');
    localStorage.setItem('gymName', gym.name || '');
    localStorage.setItem('gymPixKey', gym.pix_key || '');
  } catch {
    // Non-critical if gym profile fails
  }
}

function getFullProfilePayload(extraPhotoUrl = null) {
  const photoUrl = extraPhotoUrl !== null ? extraPhotoUrl : (account('profile-photo-button')?.dataset?.photoUrl || '');
  return {
    name: value('profile-name'),
    email: value('profile-email'),
    phone: value('profile-phone'),
    cpf: value('profile-cpf'),
    rg: value('profile-rg'),
    birth_date: value('profile-birth'),
    profile_photo_url: photoUrl,
    address_details: {
      postal_code: value('profile-postal-code'),
      street: value('profile-street'),
      number: account('profile-no-number')?.checked ? 'S/N' : value('profile-address-number'),
      complement: value('profile-address-complement'),
      neighborhood: value('profile-neighborhood'),
      city: value('profile-city'),
      state: value('profile-state'),
      country: value('profile-country') || 'Brasil'
    }
  };
}

async function savePersonal(event) {
  event.preventDefault();
  const status = account('profile-status');
  const btn = account('save-personal-button');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Salvando dados pessoais...';
  try {
    let photoUrl = account('profile-photo-button')?.dataset?.photoUrl || '';
    const file = account('profile-photo-file')?.files?.[0];
    if (file) photoUrl = await uploadProfilePhoto(file);

    await accountApi('/api/me/profile', { method: 'POST', body: JSON.stringify(getFullProfilePayload(photoUrl)) });
    localStorage.setItem('academiaUserName', value('profile-name'));
    if (account('profile-display-name')) account('profile-display-name').textContent = value('profile-name');
    if (account('profile-display-email')) account('profile-display-email').textContent = value('profile-email');
    if (status) status.textContent = 'Dados pessoais salvos com sucesso.';
  } catch (error) {
    if (status) status.textContent = `Erro ao salvar dados pessoais: ${error.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveAddress(event) {
  event.preventDefault();
  const status = account('address-status');
  const btn = account('save-address-button');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Salvando endereço...';
  try {
    await accountApi('/api/me/profile', { method: 'POST', body: JSON.stringify(getFullProfilePayload()) });
    if (status) status.textContent = 'Endereço salvo com sucesso.';
  } catch (error) {
    if (status) status.textContent = `Erro ao salvar endereço: ${error.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveGym() {
  const status = account('gym-status');
  const btn = account('save-gym-button');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Salvando dados da empresa...';
  try {
    let logoUrl = account('gym-logo-preview')?.dataset?.logoUrl || localStorage.getItem('gymLogoUrl') || '';
    const file = account('gym-logo-file')?.files?.[0];
    if (file) {
      logoUrl = await uploadProfilePhoto(file);
      const preview = account('gym-logo-preview');
      if (preview) {
        preview.src = logoUrl;
        preview.dataset.logoUrl = logoUrl;
      }
    }
    const updated = await accountApi('/api/gym/profile', {
      method: 'POST',
      body: JSON.stringify({
        name: value('gym-name'),
        email: value('gym-email'),
        phone: value('gym-phone'),
        document_number: value('gym-document'),
        address: value('gym-address'),
        timezone: value('gym-timezone'),
        pix_key: value('gym-pix-key'),
        logo_url: logoUrl
      })
    });
    localStorage.setItem('gymLogoUrl', updated.logo_url || '');
    localStorage.setItem('gymName', updated.name || '');
    localStorage.setItem('gymPixKey', updated.pix_key || '');
    window.dispatchEvent(new CustomEvent('academia:brand-updated', { detail: updated }));
    document.querySelectorAll('.top-nav-logo').forEach((img) => { if (updated.logo_url) img.src = updated.logo_url; });
    if (status) status.textContent = 'Dados da empresa salvos com sucesso.';
  } catch (error) {
    if (status) status.textContent = `Erro ao salvar empresa: ${error.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function savePassword(event) {
  event.preventDefault();
  const status = account('security-status');
  const currentPassword = value('password-current');
  const newPassword = value('password-new');
  const confirmPassword = value('password-confirm');

  if (!currentPassword || !newPassword) {
    if (status) status.textContent = 'Preencha a senha atual e a nova senha.';
    return;
  }

  if (newPassword.length < 8) {
    if (status) status.textContent = 'A nova senha deve conter pelo menos 8 caracteres.';
    return;
  }

  if (newPassword !== confirmPassword) {
    if (status) status.textContent = 'A nova senha e a confirmação não coincidem.';
    return;
  }

  const btn = account('save-password-button');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Alterando senha...';

  try {
    await accountApi('/api/me/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    fill('password-current', '');
    fill('password-new', '');
    fill('password-confirm', '');
    if (status) status.textContent = 'Senha alterada com sucesso!';
  } catch (error) {
    if (error.message === 'senha_atual_invalida') {
      if (status) status.textContent = 'Senha atual incorreta.';
    } else if (error.message === 'senha_muito_curta') {
      if (status) status.textContent = 'A nova senha deve ter no mínimo 8 caracteres.';
    } else {
      if (status) status.textContent = `Erro ao alterar senha: ${error.message}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Logo upload triggers
account('gym-logo-upload-btn')?.addEventListener('click', () => account('gym-logo-file')?.click());
account('gym-logo-preview')?.addEventListener('click', () => account('gym-logo-file')?.click());
account('gym-logo-file')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const preview = account('gym-logo-preview');
      if (preview) preview.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
});

// Photo upload triggers
account('profile-photo-button')?.addEventListener('click', () => account('profile-photo-file')?.click());
account('profile-photo-file')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const localUrl = URL.createObjectURL(file);
    renderProfilePhoto(localUrl, value('profile-name'));
    const uploadedUrl = await uploadProfilePhoto(file);
    account('profile-photo-button').dataset.photoUrl = uploadedUrl;
    await accountApi('/api/me/profile', { method: 'POST', body: JSON.stringify(getFullProfilePayload(uploadedUrl)) });
    document.querySelectorAll('.profile-avatar img').forEach((img) => { img.src = uploadedUrl; });
  } catch (err) {
    alert(`Erro ao enviar foto: ${err.message}`);
  }
});

account('profile-form-personal')?.addEventListener('submit', savePersonal);
account('profile-form-address')?.addEventListener('submit', saveAddress);
account('save-gym-button')?.addEventListener('click', saveGym);
account('profile-form-security')?.addEventListener('submit', savePassword);

account('profile-no-number')?.addEventListener('change', (e) => {
  const numInput = account('profile-address-number');
  if (!numInput) return;
  if (e.target.checked) {
    numInput.value = 'S/N';
    numInput.disabled = true;
  } else {
    if (numInput.value.toUpperCase() === 'S/N') numInput.value = '';
    numInput.disabled = false;
    numInput.focus();
  }
});

initTabs();
loadProfile();
