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
  account('profile-access-badge').textContent = roleText(user.access_profile, user.role);
  const address = user.address_details || {};
  for (const [id, key] of [['profile-postal-code', 'postal_code'], ['profile-street', 'street'], ['profile-address-number', 'number'], ['profile-address-complement', 'complement'], ['profile-neighborhood', 'neighborhood'], ['profile-city', 'city'], ['profile-state', 'state'], ['profile-country', 'country']]) fill(id, address[key]);
  const phone = digits(user.phone);
  const whatsapp = account('profile-whatsapp');
  if (phone) { whatsapp.href = `https://wa.me/${phone}`; whatsapp.classList.remove('hidden'); }
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
    setAccountStatus('Perfil carregado.');
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
    await accountApi('/api/me/profile', { method: 'POST', body: JSON.stringify({
      name: value('profile-name'), email: value('profile-email'), phone: value('profile-phone'),
      cpf: value('profile-cpf'), rg: value('profile-rg'), birth_date: value('profile-birth'),
      address_details: { postal_code: value('profile-postal-code'), street: value('profile-street'), number: value('profile-address-number'), complement: value('profile-address-complement'), neighborhood: value('profile-neighborhood'), city: value('profile-city'), state: value('profile-state'), country: value('profile-country') }
    }) });
    localStorage.setItem('academiaUserName', value('profile-name'));
    setAccountStatus('Perfil salvo com sucesso.');
  } catch (error) { setAccountStatus(`Erro ao salvar perfil: ${error.message}`); }
}

async function saveGym() {
  try {
    await accountApi('/api/gym/profile', { method: 'POST', body: JSON.stringify({ name: value('gym-name'), email: value('gym-email'), phone: value('gym-phone'), document_number: value('gym-document'), address: value('gym-address'), timezone: value('gym-timezone') }) });
    setAccountStatus('Dados da academia salvos.');
  } catch (error) { setAccountStatus(`Erro ao salvar academia: ${error.message}`); }
}

account('profile-form').addEventListener('submit', saveProfile);
account('save-gym-button').addEventListener('click', saveGym);
account('profile-phone').addEventListener('input', (event) => { event.target.value = event.target.value; });
loadProfile();
