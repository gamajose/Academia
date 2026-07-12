const usersHost = window.location.hostname || 'localhost';
const USERS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${usersHost}:3004`;
const usersToken = localStorage.getItem('academiaToken') || '';
const get = (id) => document.getElementById(id);
const digits = (value) => String(value || '').replace(/\D/g, '');
let accessProfiles = [];
let permissionKeys = [];

const moduleLabels = {
  dashboard: 'Painel', members: 'Alunos', plans: 'Planos', memberships: 'Matrículas',
  pre_enrollments: 'Pré-matrículas', finance: 'Financeiro', alerts: 'Alertas',
  training: 'Treinos', assessments: 'Avaliações', student_access: 'Acesso do aluno',
  users: 'Funcionários e usuários', account: 'Perfil e conta', reports: 'Relatórios',
  access: 'Controle de acesso', classes: 'Aulas', settings: 'Configurações',
  audit: 'Auditoria', exports: 'Exportações'
};
const roleLabels = { owner: 'Proprietário', admin: 'Administrador', staff: 'Equipe', operator: 'Operação' };

function setStatus(text) { get('users-status').textContent = text; }
function setProfileStatus(text) { get('access-profiles-status').textContent = text; }

function friendly(error) {
  const messages = {
    sem_permissao: 'Seu perfil não pode executar esta ação.',
    dados_invalidos: 'Preencha os dados obrigatórios.',
    perfil_invalido: 'Informe um nome e um tipo de conta válidos.',
    perfil_ja_cadastrado: 'Já existe um perfil com esse nome.',
    perfil_nao_encontrado: 'Perfil não encontrado.',
    perfil_em_uso: 'Esse perfil está vinculado a funcionários. Troque o perfil deles antes de excluir.',
    nivel_em_uso: 'Esse nível já está sendo usado. Desative-o para não aparecer em novos cadastros.',
    email_ja_cadastrado: 'E-mail já cadastrado.',
    cpf_ja_cadastrado: 'CPF já cadastrado nesta academia.',
    usuario_nao_encontrado: 'Funcionário não encontrado.',
    senha_fraca: 'A senha precisa ter maiúscula, minúscula e número.',
    nao_pode_desativar_proprio_usuario: 'Você não pode desativar seu próprio acesso.'
  };
  return messages[error.message] || `Erro: ${error.message}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${USERS_API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usersToken}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function roleLabel(role) { return roleLabels[role] || role || 'Equipe'; }
function profileFor(slug) { return accessProfiles.find((profile) => profile.slug === slug); }

function whatsappLink(phone) {
  const number = digits(phone);
  if (!number) return null;
  const international = number.length <= 11 ? `55${number}` : number;
  const link = document.createElement('a');
  link.href = `https://wa.me/${international}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = phone;
  link.className = 'contact-link';
  return link;
}

function renderUsers(rows) {
  const table = get('users-table');
  table.innerHTML = '';
  for (const user of rows) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = user.name || ''; row.appendChild(name);
    const contact = document.createElement('td');
    const email = document.createElement('div'); email.textContent = user.email || 'Sem e-mail'; contact.appendChild(email);
    const phone = whatsappLink(user.phone); if (phone) contact.appendChild(phone); else { const empty = document.createElement('small'); empty.textContent = 'Sem telefone'; contact.appendChild(empty); }
    row.appendChild(contact);
    const job = document.createElement('td'); job.textContent = user.job_title || roleLabel(user.role); row.appendChild(job);
    const access = document.createElement('td'); access.textContent = user.access_profile_name || profileFor(user.access_profile)?.name || roleLabel(user.role); row.appendChild(access);
    const status = document.createElement('td'); status.textContent = user.is_active ? 'Ativo' : 'Inativo'; row.appendChild(status);
    const actions = document.createElement('td');
    const edit = document.createElement('button'); edit.className = 'mini-button secondary'; edit.type = 'button'; edit.textContent = 'Editar'; edit.onclick = () => editUser(user); actions.appendChild(edit);
    const toggle = document.createElement('button'); toggle.className = 'mini-button'; toggle.type = 'button'; toggle.textContent = user.is_active ? 'Desativar' : 'Ativar'; toggle.onclick = () => toggleUser(user); actions.appendChild(toggle);
    row.appendChild(actions); table.appendChild(row);
  }
}

function renderPermissionInputs(selected = {}) {
  const grid = get('permissions-grid');
  grid.innerHTML = '';
  for (const key of permissionKeys) {
    const label = document.createElement('label'); label.className = 'permission-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.permission = key; input.checked = selected[key] === true;
    label.append(input, document.createTextNode(moduleLabels[key] || key)); grid.appendChild(label);
  }
}

function readPermissionInputs() {
  return Object.fromEntries([...document.querySelectorAll('[data-permission]')].map((input) => [input.dataset.permission, input.checked]));
}

function renderProfileSelect(selected = '') {
  const select = get('user-access-profile');
  const current = selected || select.value;
  select.innerHTML = '';
  for (const profile of accessProfiles.filter((item) => item.is_active)) {
    const option = document.createElement('option'); option.value = profile.slug; option.textContent = profile.name; option.selected = profile.slug === current; select.appendChild(option);
  }
  if (!select.value && select.options[0]) select.value = select.options[0].value;
  updatePermissionHelp();
}

function updatePermissionHelp() {
  const profile = profileFor(get('user-access-profile').value);
  if (!profile) { get('permission-help').textContent = 'Cadastre um perfil de acesso antes de criar o funcionário.'; get('user-role-preview').textContent = 'Tipo de conta: não definido'; return; }
  const count = Object.values(profile.permissions || {}).filter(Boolean).length;
  get('permission-help').textContent = `${count} módulo(s) liberado(s): ${Object.entries(profile.permissions || {}).filter(([, enabled]) => enabled).map(([key]) => moduleLabels[key] || key).join(', ') || 'nenhum'}.`;
  get('user-role').value = profile.role_key;
  get('user-role-preview').textContent = `Tipo de conta: ${roleLabel(profile.role_key)}`;
}

function renderAccessProfiles() {
  const list = get('access-profile-list'); list.innerHTML = '';
  for (const profile of accessProfiles) {
    const card = document.createElement('article'); card.className = 'access-profile-card';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = profile.name; info.appendChild(title);
    const role = document.createElement('small'); role.textContent = `${roleLabel(profile.role_key)} · ${(Object.values(profile.permissions || {}).filter(Boolean)).length} módulos liberados`; info.appendChild(role);
    const modules = document.createElement('p'); modules.textContent = Object.entries(profile.permissions || {}).filter(([, enabled]) => enabled).map(([key]) => moduleLabels[key] || key).join(' · ') || 'Nenhum módulo liberado'; info.appendChild(modules);
    if (!profile.is_active) { const inactive = document.createElement('small'); inactive.className = 'profile-status-inactive'; inactive.textContent = 'Inativo'; info.appendChild(inactive); }
    const actions = document.createElement('div'); actions.className = 'access-profile-actions';
    const edit = document.createElement('button'); edit.className = 'mini-button secondary'; edit.type = 'button'; edit.textContent = 'Editar'; edit.onclick = () => openProfileEditor(profile); actions.appendChild(edit);
    const toggle = document.createElement('button'); toggle.className = 'mini-button'; toggle.type = 'button'; toggle.textContent = profile.is_active ? 'Desativar' : 'Ativar'; toggle.onclick = () => toggleProfile(profile); actions.appendChild(toggle);
    const remove = document.createElement('button'); remove.className = 'mini-button secondary'; remove.type = 'button'; remove.textContent = 'Excluir'; remove.onclick = () => deleteProfile(profile); actions.appendChild(remove);
    card.append(info, actions); list.appendChild(card);
  }
}

function openProfileEditor(profile = null) {
  get('access-profile-form').classList.remove('hidden');
  get('access-profile-id').value = profile?.id || '';
  get('access-profile-name').value = profile?.name || '';
  get('access-profile-role').value = profile?.role_key || 'staff';
  renderPermissionInputs(profile?.permissions || {});
  get('access-profile-name').focus();
}

function closeProfileEditor() { get('access-profile-form').classList.add('hidden'); get('access-profile-form').reset(); }

async function saveAccessProfile(event) {
  event.preventDefault();
  const id = get('access-profile-id').value;
  const payload = { id: id || undefined, name: get('access-profile-name').value.trim(), role_key: get('access-profile-role').value, permissions: readPermissionInputs() };
  try {
    await api(id ? '/api/access-profiles/update' : '/api/access-profiles', { method: 'POST', body: JSON.stringify(payload) });
    closeProfileEditor(); await loadAccessProfiles(); setProfileStatus('Perfil salvo.');
  } catch (error) { setProfileStatus(friendly(error)); }
}

async function toggleProfile(profile) {
  try {
    await api('/api/access-profiles/update', { method: 'POST', body: JSON.stringify({ id: profile.id, name: profile.name, role_key: profile.role_key, permissions: profile.permissions, is_active: !profile.is_active }) });
    await loadAccessProfiles(); setProfileStatus(profile.is_active ? 'Perfil desativado.' : 'Perfil ativado.');
  } catch (error) { setProfileStatus(friendly(error)); }
}

async function deleteProfile(profile) {
  if (!window.confirm(`Excluir o perfil "${profile.name}"?`)) return;
  try { await api('/api/access-profiles', { method: 'DELETE', body: JSON.stringify({ id: profile.id }) }); await loadAccessProfiles(); setProfileStatus('Perfil excluído.'); }
  catch (error) { setProfileStatus(friendly(error)); }
}

async function loadAccessProfiles() {
  const result = await api('/api/access-profiles');
  accessProfiles = result.data || []; permissionKeys = result.permission_keys || Object.keys(moduleLabels);
  renderAccessProfiles(); renderProfileSelect(get('user-access-profile').value);
}

async function loadUsers() {
  if (!usersToken) { setStatus('Faça login no painel antes de acessar funcionários.'); return; }
  try { const result = await api('/api/users'); renderUsers(result.data || []); setStatus('Equipe carregada.'); }
  catch (error) { setStatus(friendly(error)); }
}

function setField(id, value) { get(id).value = value || ''; }

function resetForm() {
  get('employee-form').reset(); setField('user-id', ''); get('user-country').value = 'Brasil';
  get('employee-form-title').textContent = 'Cadastrar funcionário'; get('save-user-button').textContent = 'Cadastrar funcionário';
  get('cancel-edit-button').hidden = true; get('user-password').required = true; get('user-password-field').querySelector('label').textContent = 'Senha inicial *';
  renderProfileSelect(accessProfiles.find((profile) => profile.is_active)?.slug || '');
}

function editUser(user) {
  setField('user-id', user.id); setField('user-name', user.name); setField('user-email', user.email); setField('user-phone', user.phone); setField('user-cpf', user.cpf); setField('user-rg', user.rg); setField('user-birth', user.birth_date?.slice(0, 10)); setField('user-job-title', user.job_title);
  renderProfileSelect(user.access_profile);
  const address = user.address_details || {};
  for (const [id, key] of [['user-postal-code', 'postal_code'], ['user-street', 'street'], ['user-address-number', 'number'], ['user-address-complement', 'complement'], ['user-neighborhood', 'neighborhood'], ['user-city', 'city'], ['user-state', 'state'], ['user-country', 'country']]) setField(id, address[key]);
  get('employee-form-title').textContent = 'Editar funcionário'; get('save-user-button').textContent = 'Salvar alterações'; get('cancel-edit-button').hidden = false; get('user-password').required = false; get('user-password-field').querySelector('label').textContent = 'Senha inicial (opcional)';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveUser(event) {
  event.preventDefault();
  const id = get('user-id').value;
  const payload = {
    user_id: id || undefined, name: get('user-name').value.trim(), email: get('user-email').value.trim(), phone: get('user-phone').value.trim(), cpf: get('user-cpf').value.trim(), rg: get('user-rg').value.trim(), birth_date: get('user-birth').value || null, job_title: get('user-job-title').value.trim(), role: get('user-role').value, access_profile: get('user-access-profile').value,
    address_details: { postal_code: get('user-postal-code').value.trim(), street: get('user-street').value.trim(), number: get('user-address-number').value.trim(), complement: get('user-address-complement').value.trim(), neighborhood: get('user-neighborhood').value.trim(), city: get('user-city').value.trim(), state: get('user-state').value.trim(), country: get('user-country').value.trim() }
  };
  try {
    if (id) await api('/api/users/update', { method: 'POST', body: JSON.stringify(payload) });
    else await api('/api/users', { method: 'POST', body: JSON.stringify({ ...payload, password: get('user-password').value }) });
    setStatus(id ? 'Funcionário atualizado.' : 'Funcionário cadastrado.'); resetForm(); await loadUsers();
  } catch (error) { setStatus(friendly(error)); }
}

async function toggleUser(user) {
  try { await api(`/api/users/${user.is_active ? 'deactivate' : 'activate'}`, { method: 'POST', body: JSON.stringify({ user_id: user.id }) }); setStatus(user.is_active ? 'Funcionário desativado.' : 'Funcionário ativado.'); await loadUsers(); }
  catch (error) { setStatus(friendly(error)); }
}

get('user-access-profile').addEventListener('change', updatePermissionHelp);
get('employee-form').addEventListener('submit', saveUser);
get('cancel-edit-button').addEventListener('click', resetForm);
get('refresh-users-button').addEventListener('click', loadUsers);
get('new-access-profile-button').addEventListener('click', () => openProfileEditor());
get('cancel-access-profile-button').addEventListener('click', closeProfileEditor);
get('access-profile-form').addEventListener('submit', saveAccessProfile);

(async function init() {
  if (!usersToken) { setStatus('Faça login no painel antes de acessar funcionários.'); return; }
  try { await Promise.all([loadAccessProfiles(), loadUsers()]); setProfileStatus('Perfis carregados.'); }
  catch (error) { setProfileStatus(friendly(error)); setStatus(friendly(error)); }
})();
