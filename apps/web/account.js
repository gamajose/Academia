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
function setAccountStatus(text) { account('profile-status').textContent = text; }
function value(id) { return account(id).value.trim(); }
function fill(id, text) { account(id).value = text || ''; }

function renderProfilePhoto(url, name) {
  const host = account('profile-photo-button');
  host.replaceChildren();
  host.dataset.photoUrl = url || '';
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.onerror = () => { host.textContent = String(name || 'J').trim().charAt(0).toUpperCase() || 'J'; };
    host.appendChild(image);
  } else host.textContent = String(name || 'J').trim().charAt(0).toUpperCase() || 'J';
}

function renderPreferences(preferences = {}) {
  fill('profile-language', preferences.language || localStorage.getItem('adminLanguage') || 'pt-BR');
  fill('profile-theme', preferences.theme || localStorage.getItem('adminTheme') || 'light');
  const accent = preferences.accent || localStorage.getItem('adminAccent') || 'blue';
  const accentInput = document.querySelector(`input[name="profile-accent"][value="${accent}"]`);
  if (accentInput) accentInput.checked = true;
}

function selectedAccent() {
  return document.querySelector('input[name="profile-accent"]:checked')?.value || 'blue';
}

function previewPreferences() {
  if (typeof applyAdminPreferences !== 'function') return;
  applyAdminPreferences({
    language: value('profile-language'),
    theme: value('profile-theme'),
    accent: selectedAccent()
  });
}

function roleText(profile, role) {
  if (role === 'owner') return 'Proprietário · acesso total';
  if (role === 'admin') return 'Administrador · gestão da academia';
  if (profile === 'trainer') return 'Personal trainer · treinos e evolução';
  if (profile === 'operator') return 'Operação · controle de acesso';
  return 'Recepção · atendimento e cadastros';
}

function renderProfile(user) {
  fill('profile-name', user.name);
  fill('profile-email', user.email);
  fill('profile-phone', user.phone);
  fill('profile-cpf', user.cpf);
  fill('profile-rg', user.rg);
  fill('profile-birth', user.birth_date ? String(user.birth_date).slice(0, 10) : '');
  fill('profile-job-title', user.job_title || roleText(user.access_profile, user.role));
  renderProfilePhoto(user.profile_photo_url, user.name);
  renderPreferences(user.profile_preferences);
  account('profile-access-badge').textContent = user.access_profile_name || roleText(user.access_profile, user.role);
  const address = user.address_details || {};
  for (const [id, key] of [['profile-postal-code', 'postal_code'], ['profile-street', 'street'], ['profile-address-number', 'number'], ['profile-address-complement', 'complement'], ['profile-neighborhood', 'neighborhood'], ['profile-city', 'city'], ['profile-state', 'state'], ['profile-country', 'country']]) fill(id, address[key]);
  const phone = digits(user.phone);
  const whatsapp = account('profile-whatsapp');
  if (phone) { whatsapp.href = `https://wa.me/${phone}`; whatsapp.classList.remove('hidden'); }
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
    localStorage.setItem('academiaAccessProfile', user.access_profile || '');
    const canManageGym = ['owner', 'admin'].includes(user.role);
    account('gym-profile-panel').hidden = !canManageGym;
    await loadGym(canManageGym);
    setAccountStatus('');
  } catch (error) { setAccountStatus(`Erro: ${error.message}`); }
}

async function loadGym(canManageGym) {
  if (!canManageGym) return;
  const gym = await accountApi('/api/gym/profile');
  fill('gym-name', gym.name); fill('gym-email', gym.email); fill('gym-phone', gym.phone);
  fill('gym-document', gym.document_number); fill('gym-address', gym.address); fill('gym-timezone', gym.timezone);
}

async function saveProfile(event) {
  event.preventDefault();
  try {
    let photoUrl = account('profile-photo-button').dataset.photoUrl || '';
    const file = account('profile-photo-file').files?.[0];
    if (file) photoUrl = await uploadProfilePhoto(file);
    await accountApi('/api/me/profile', { method: 'POST', body: JSON.stringify({
      name: value('profile-name'), email: value('profile-email'), phone: value('profile-phone'),
      cpf: value('profile-cpf'), rg: value('profile-rg'), birth_date: value('profile-birth'),
      profile_photo_url: photoUrl,
      address_details: { postal_code: value('profile-postal-code'), street: value('profile-street'), number: value('profile-address-number'), complement: value('profile-address-complement'), neighborhood: value('profile-neighborhood'), city: value('profile-city'), state: value('profile-state'), country: value('profile-country') }
    }) });
    localStorage.setItem('academiaUserName', value('profile-name'));
    setAccountStatus('Perfil salvo com sucesso.');
  } catch (error) { setAccountStatus(`Erro ao salvar perfil: ${error.message}`); }
}

async function savePreferences() {
  const status = account('preferences-status');
  try {
    const preferences = { language: value('profile-language'), theme: value('profile-theme'), accent: selectedAccent() };
    await accountApi('/api/me/preferences', { method: 'POST', body: JSON.stringify(preferences) });
    localStorage.setItem('adminLanguage', preferences.language);
    localStorage.setItem('adminTheme', preferences.theme);
    localStorage.setItem('adminAccent', preferences.accent);
    if (typeof applyAdminPreferences === 'function') applyAdminPreferences(preferences);
    status.textContent = 'Preferências salvas.';
    setAccountStatus('Preferências salvas.');
    closePreferences();
  } catch (error) { status.textContent = `Erro ao salvar preferências: ${error.message}`; }
}

async function saveGym() {
  try {
    await accountApi('/api/gym/profile', { method: 'POST', body: JSON.stringify({ name: value('gym-name'), email: value('gym-email'), phone: value('gym-phone'), document_number: value('gym-document'), address: value('gym-address'), timezone: value('gym-timezone') }) });
    setAccountStatus('Dados da academia salvos.');
  } catch (error) { setAccountStatus(`Erro ao salvar academia: ${error.message}`); }
}

account('profile-form').addEventListener('submit', saveProfile);
account('save-gym-button').addEventListener('click', saveGym);
account('save-preferences-button').addEventListener('click', savePreferences);
account('open-preferences-button').addEventListener('click', () => {
  const modal = account('preferences-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  account('profile-language').focus();
});
function closePreferences() {
  const modal = account('preferences-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
account('close-preferences-button').addEventListener('click', closePreferences);
account('cancel-preferences-button').addEventListener('click', closePreferences);
account('preferences-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closePreferences();
});
account('profile-language').addEventListener('change', previewPreferences);
account('profile-theme').addEventListener('change', previewPreferences);
document.querySelectorAll('input[name="profile-accent"]').forEach((input) => input.addEventListener('change', previewPreferences));
account('profile-photo-button').addEventListener('click', () => account('profile-photo-file').click());
account('profile-photo-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  renderProfilePhoto(URL.createObjectURL(file), value('profile-name'));
});
account('profile-phone').addEventListener('input', (event) => { event.target.value = event.target.value; });
loadProfile();
