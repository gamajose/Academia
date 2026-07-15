const usersHost = window.location.hostname || 'localhost';
const USERS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${usersHost}:3004`;
const usersToken = localStorage.getItem('academiaToken') || '';
const get = (id) => document.getElementById(id);
const digits = (value) => String(value || '').replace(/\D/g, '');
const REALTIME_INTERVAL_MS = 3000;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

let accessProfiles = [];
let permissionKeys = [];
let usersRequestInFlight = false;
let usersRefreshTimer = null;
let lastUsersSignature = '';

const moduleLabels = {
  dashboard: 'Painel', members: 'Alunos', plans: 'Planos', memberships: 'Matrículas',
  pre_enrollments: 'Pré-matrículas', finance: 'Financeiro', alerts: 'Alertas',
  training: 'Treinos', assessments: 'Avaliações', student_access: 'Acesso do aluno',
  users: 'Funcionários e usuários', account: 'Perfil e conta', reports: 'Relatórios',
  access: 'Controle de acesso', classes: 'Aulas', settings: 'Configurações',
  audit: 'Auditoria', exports: 'Exportações'
};

function setStatus(text) {
  const target = get('users-status');
  if (target) target.textContent = text;
}

function setFormStatus(text) {
  const target = get('user-form-status');
  if (target) target.textContent = text;
}

function setPermissionsStatus(text) {
  const target = get('access-profiles-status');
  if (target) target.textContent = text;
}

function friendly(error) {
  const messages = {
    sem_permissao: 'Seu perfil não pode executar esta ação.',
    dados_invalidos: 'Preencha os dados obrigatórios.',
    email_ja_cadastrado: 'E-mail já cadastrado.',
    cpf_ja_cadastrado: 'CPF já cadastrado nesta academia.',
    usuario_nao_encontrado: 'Funcionário não encontrado.',
    senha_fraca: 'A senha precisa ter maiúscula, minúscula e número.',
    nao_pode_desativar_proprio_usuario: 'Você não pode desativar seu próprio acesso.',
    perfil_invalido: 'Informe um nome válido para o perfil.',
    perfil_ja_cadastrado: 'Já existe um perfil com esse nome.',
    perfil_nao_encontrado: 'Perfil não encontrado.',
    perfil_em_uso: 'Esse perfil está vinculado a funcionários. Troque o perfil deles antes de excluir ou desativar.',
    not_found: 'A API de perfis ainda não foi atualizada. Aguarde o deploy da versão mais recente.'
  };
  return messages[error.message] || `Erro: ${error.message}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${USERS_API_BASE_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${usersToken}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function syncModalState() {
  const hasOpenModal = Boolean(document.querySelector('.modal:not(.hidden)'));
  document.body.classList.toggle('modal-open', hasOpenModal);
}

function profileFor(slug) {
  return accessProfiles.find((profile) => profile.slug === slug);
}

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

function formatLastSeen(value) {
  if (!value) return 'Nunca acessou';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca acessou';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function presenceFor(user) {
  if (!user.is_active) return { key: 'disabled', label: 'Desativado' };
  const lastSeen = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
  if (lastSeen && Date.now() - lastSeen <= ACTIVE_WINDOW_MS) {
    return { key: 'active', label: 'Ativo agora' };
  }
  return { key: 'inactive', label: 'Inativo' };
}

function createPresenceCell(user) {
  const cell = document.createElement('td');
  cell.className = 'status-cell';
  const presence = presenceFor(user);
  const dot = document.createElement('span');
  dot.className = `presence-dot presence-${presence.key}`;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', presence.label);
  dot.title = presence.label;
  cell.appendChild(dot);
  return cell;
}

function usersSignature(rows) {
  const minuteBucket = Math.floor(Date.now() / 60000);
  return JSON.stringify({
    minuteBucket,
    rows: rows.map((user) => [
      user.id,
      user.name,
      user.email,
      user.phone,
      user.job_title,
      user.access_profile,
      user.access_profile_name,
      user.is_active,
      user.last_seen_at
    ])
  });
}

function renderUsers(rows) {
  const table = get('users-table');
  if (!table) return;
  table.innerHTML = '';

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'employee-empty-row';
    cell.textContent = 'Nenhum funcionário cadastrado.';
    row.appendChild(cell);
    table.appendChild(row);
    return;
  }

  for (const user of rows) {
    const row = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = user.name || '';
    row.appendChild(name);

    const contact = document.createElement('td');
    const email = document.createElement('div');
    email.textContent = user.email || 'Sem e-mail';
    contact.appendChild(email);
    const phone = whatsappLink(user.phone);
    if (phone) {
      contact.appendChild(phone);
    } else {
      const empty = document.createElement('small');
      empty.textContent = 'Sem telefone';
      contact.appendChild(empty);
    }
    row.appendChild(contact);

    const job = document.createElement('td');
    job.textContent = user.job_title || 'Sem cargo';
    row.appendChild(job);

    const access = document.createElement('td');
    access.textContent = user.access_profile_name || profileFor(user.access_profile)?.name || 'Sem perfil';
    row.appendChild(access);

    const lastSeen = document.createElement('td');
    lastSeen.className = 'last-seen-cell';
    lastSeen.textContent = formatLastSeen(user.last_seen_at);
    row.appendChild(lastSeen);

    row.appendChild(createPresenceCell(user));

    const actions = document.createElement('td');
    actions.className = 'employee-row-actions';

    const edit = window.AcademiaIcons.button('edit', 'Editar funcionário');
    edit.addEventListener('click', () => editUser(user));
    actions.appendChild(edit);

    const toggle = document.createElement('button');
    toggle.className = 'mini-button';
    toggle.type = 'button';
    toggle.textContent = user.is_active ? '⊘' : '●';
    toggle.title = user.is_active ? 'Desativar funcionário' : 'Ativar funcionário';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.className = 'icon-button';
    toggle.addEventListener('click', () => toggleUser(user));
    actions.appendChild(toggle);

    row.appendChild(actions);
    table.appendChild(row);
  }
}

function renderProfileSelect(selected = '') {
  const select = get('user-access-profile');
  if (!select) return;
  const current = selected || select.value;
  select.innerHTML = '';

  for (const profile of accessProfiles.filter((item) => item.is_active)) {
    const option = document.createElement('option');
    option.value = profile.slug;
    option.textContent = profile.name;
    option.selected = profile.slug === current;
    select.appendChild(option);
  }

  if (!select.value && select.options[0]) select.value = select.options[0].value;
  updateProfileHelp();
}

function updateProfileHelp() {
  const select = get('user-access-profile');
  if (!select) return;
  const profile = profileFor(select.value);
  get('user-role').value = profile?.role_key || 'staff';
  get('user-role-preview').textContent = profile
    ? 'As permissões deste funcionário são definidas pelo perfil selecionado.'
    : 'Cadastre um perfil pelo botão Permissões antes de criar o funcionário.';
  get('permission-help').textContent = profile
    ? `Perfil selecionado: ${profile.name}. Para alterar os módulos, use o botão Permissões.`
    : 'Cadastre um perfil pelo botão Permissões antes de criar o funcionário.';
}

function renderPermissionInputs(selected = {}) {
  const grid = get('permissions-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!permissionKeys.length) {
    const empty = document.createElement('span');
    empty.className = 'permissions-loading';
    empty.textContent = 'Nenhum módulo disponível.';
    grid.appendChild(empty);
    return;
  }

  for (const key of permissionKeys) {
    const label = document.createElement('label');
    label.className = 'permission-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.permission = key;
    input.checked = selected[key] === true;
    label.append(input, document.createTextNode(moduleLabels[key] || key));
    grid.appendChild(label);
  }
}

function readPermissions() {
  return Object.fromEntries(
    [...document.querySelectorAll('#access-profile-form [data-permission]')]
      .map((input) => [input.dataset.permission, input.checked])
  );
}

function renderPermissionProfiles() {
  const list = get('access-profile-list');
  if (!list) return;
  list.innerHTML = '';

  if (!accessProfiles.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum perfil cadastrado.';
    list.appendChild(empty);
    return;
  }

  for (const profile of accessProfiles) {
    const card = document.createElement('article');
    card.className = 'access-profile-card';

    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = profile.name;
    info.appendChild(title);

    const modules = Object.entries(profile.permissions || {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => moduleLabels[key] || key);
    const summary = document.createElement('small');
    summary.textContent = `${modules.length} módulo(s) liberado(s)`;
    info.appendChild(summary);

    const details = document.createElement('p');
    details.textContent = modules.join(' · ') || 'Nenhum módulo liberado';
    info.appendChild(details);

    if (!profile.is_active) {
      const inactive = document.createElement('small');
      inactive.className = 'profile-status-inactive';
      inactive.textContent = 'Inativo';
      info.appendChild(inactive);
    }

    const actions = document.createElement('div');
    actions.className = 'access-profile-actions';

    const edit = window.AcademiaIcons.button('edit', 'Editar perfil de acesso');
    edit.addEventListener('click', () => openPermissionsEditor(profile));
    actions.appendChild(edit);

    const toggle = document.createElement('button');
    toggle.className = 'mini-button';
    toggle.type = 'button';
    toggle.textContent = profile.is_active ? '⊘' : '●';
    toggle.className = 'icon-button';
    toggle.title = profile.is_active ? 'Desativar perfil de acesso' : 'Ativar perfil de acesso';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.addEventListener('click', () => toggleAccessProfile(profile));
    actions.appendChild(toggle);

    const remove = window.AcademiaIcons.button('trash', 'Excluir perfil de acesso', 'danger');
    remove.addEventListener('click', () => deleteAccessProfile(profile));
    actions.appendChild(remove);

    card.append(info, actions);
    list.appendChild(card);
  }
}

async function loadAccessProfiles({ renderManager = false } = {}) {
  const result = await api('/api/access-profiles');
  accessProfiles = result.data || [];
  permissionKeys = result.permission_keys || Object.keys(moduleLabels);
  renderProfileSelect(get('user-access-profile')?.value || '');
  if (renderManager || !get('permissions-manager-modal')?.classList.contains('hidden')) {
    renderPermissionProfiles();
  }
}

function openPermissionsEditor(profile = null) {
  const form = get('access-profile-form');
  const modal = get('access-profile-modal');
  if (!form || !modal) return;
  form.classList.remove('hidden');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  get('access-profile-id').value = profile?.id || '';
  get('access-profile-name').value = profile?.name || '';
  get('save-access-profile-button').textContent = profile ? 'Salvar alterações' : 'Salvar perfil';
  renderPermissionInputs(profile?.permissions || {});
  syncModalState();
  requestAnimationFrame(() => get('access-profile-name')?.focus());
}

function closePermissionsEditor() {
  const form = get('access-profile-form');
  if (!form) return;
  get('access-profile-modal')?.classList.add('hidden');
  get('access-profile-modal')?.setAttribute('aria-hidden', 'true');
  form.reset();
  get('access-profile-id').value = '';
  get('save-access-profile-button').textContent = 'Salvar perfil';
  renderPermissionInputs();
  syncModalState();
}

async function openPermissionsModal() {
  const modal = get('permissions-manager-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncModalState();
  closePermissionsEditor();
  setPermissionsStatus('Carregando perfis...');

  try {
    await loadAccessProfiles({ renderManager: true });
    setPermissionsStatus('');
  } catch (error) {
    setPermissionsStatus(friendly(error));
  }
}

function closePermissionsModal() {
  const modal = get('permissions-manager-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  closePermissionsEditor();
  setPermissionsStatus('');
  syncModalState();
}

async function saveAccessProfile(event) {
  event.preventDefault();
  const id = get('access-profile-id').value;
  const profile = accessProfiles.find((item) => item.id === id);
  const saveButton = get('save-access-profile-button');
  const payload = {
    id: id || undefined,
    name: get('access-profile-name').value.trim(),
    role_key: profile?.role_key || 'staff',
    permissions: readPermissions()
  };

  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  setPermissionsStatus('');

  try {
    await api(id ? '/api/access-profiles/update' : '/api/access-profiles', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closePermissionsEditor();
    await loadAccessProfiles({ renderManager: true });
    setPermissionsStatus('Perfil salvo com sucesso.');
  } catch (error) {
    setPermissionsStatus(friendly(error));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = id ? 'Salvar alterações' : 'Salvar perfil';
  }
}

async function toggleAccessProfile(profile) {
  try {
    await api('/api/access-profiles/update', {
      method: 'POST',
      body: JSON.stringify({
        id: profile.id,
        name: profile.name,
        role_key: profile.role_key,
        permissions: profile.permissions,
        is_active: !profile.is_active
      })
    });
    await loadAccessProfiles({ renderManager: true });
    setPermissionsStatus(profile.is_active ? 'Perfil desativado.' : 'Perfil ativado.');
  } catch (error) {
    setPermissionsStatus(friendly(error));
  }
}

async function deleteAccessProfile(profile) {
  if (!window.confirm(`Excluir o perfil "${profile.name}"?`)) return;
  try {
    await api('/api/access-profiles', {
      method: 'DELETE',
      body: JSON.stringify({ id: profile.id })
    });
    await loadAccessProfiles({ renderManager: true });
    setPermissionsStatus('Perfil excluído.');
  } catch (error) {
    setPermissionsStatus(friendly(error));
  }
}

async function loadUsers({ silent = false, force = false } = {}) {
  if (!usersToken) {
    setStatus('Faça login no painel antes de acessar funcionários.');
    return;
  }
  if (usersRequestInFlight) return;

  usersRequestInFlight = true;
  try {
    const result = await api('/api/users');
    const rows = result.data || [];
    const signature = usersSignature(rows);
    if (force || signature !== lastUsersSignature) {
      renderUsers(rows);
      lastUsersSignature = signature;
    }
    if (!silent) setStatus('');
  } catch (error) {
    setStatus(friendly(error));
  } finally {
    usersRequestInFlight = false;
  }
}

function setField(id, value) {
  const field = get(id);
  if (field) field.value = value || '';
}

function resetForm() {
  const form = get('employee-form');
  if (!form) return;
  form.reset();
  setField('user-id', '');
  get('user-country').value = 'Brasil';
  setFormStatus('');
  get('employee-form-title').textContent = 'Cadastrar funcionário';
  get('save-user-button').textContent = 'Salvar';
  get('user-password').required = true;
  get('user-password-field').querySelector('label').textContent = 'Senha inicial *';
  renderProfileSelect(accessProfiles.find((profile) => profile.is_active)?.slug || '');
}

function openUserModal() {
  const modal = get('employee-form-panel');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncModalState();
  requestAnimationFrame(() => get('user-name')?.focus());
}

function closeUserModal() {
  const modal = get('employee-form-panel');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  resetForm();
  syncModalState();
}

function newUser() {
  resetForm();
  openUserModal();
}

function editUser(user) {
  resetForm();
  setField('user-id', user.id);
  setField('user-name', user.name);
  setField('user-email', user.email);
  setField('user-phone', user.phone);
  setField('user-cpf', user.cpf);
  setField('user-rg', user.rg);
  setField('user-birth', user.birth_date?.slice(0, 10));
  setField('user-job-title', user.job_title);
  renderProfileSelect(user.access_profile);

  const address = user.address_details || {};
  for (const [id, key] of [
    ['user-postal-code', 'postal_code'],
    ['user-street', 'street'],
    ['user-address-number', 'number'],
    ['user-address-complement', 'complement'],
    ['user-neighborhood', 'neighborhood'],
    ['user-city', 'city'],
    ['user-state', 'state'],
    ['user-country', 'country']
  ]) setField(id, address[key]);

  get('employee-form-title').textContent = 'Editar funcionário';
  get('save-user-button').textContent = 'Salvar alterações';
  get('user-password').required = false;
  get('user-password-field').querySelector('label').textContent = 'Nova senha (opcional)';
  openUserModal();
}

async function saveUser(event) {
  event.preventDefault();
  const id = get('user-id').value;
  const isEditing = Boolean(id);
  const payload = {
    user_id: id || undefined,
    name: get('user-name').value.trim(),
    email: get('user-email').value.trim(),
    phone: get('user-phone').value.trim(),
    cpf: get('user-cpf').value.trim(),
    rg: get('user-rg').value.trim(),
    birth_date: get('user-birth').value || null,
    job_title: get('user-job-title').value.trim(),
    role: get('user-role').value,
    access_profile: get('user-access-profile').value,
    address_details: {
      postal_code: get('user-postal-code').value.trim(),
      street: get('user-street').value.trim(),
      number: get('user-address-number').value.trim(),
      complement: get('user-address-complement').value.trim(),
      neighborhood: get('user-neighborhood').value.trim(),
      city: get('user-city').value.trim(),
      state: get('user-state').value.trim(),
      country: get('user-country').value.trim()
    }
  };

  const saveButton = get('save-user-button');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  setFormStatus('');

  try {
    if (isEditing) {
      await api('/api/users/update', { method: 'POST', body: JSON.stringify(payload) });
    } else {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...payload, password: get('user-password').value })
      });
    }
    closeUserModal();
    setStatus(isEditing ? 'Funcionário atualizado.' : 'Funcionário cadastrado.');
    await loadUsers({ silent: true, force: true });
  } catch (error) {
    setFormStatus(friendly(error));
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = isEditing ? 'Salvar alterações' : 'Salvar';
  }
}

async function toggleUser(user) {
  try {
    await api(`/api/users/${user.is_active ? 'deactivate' : 'activate'}`, {
      method: 'POST',
      body: JSON.stringify({ user_id: user.id })
    });
    setStatus(user.is_active ? 'Funcionário desativado.' : 'Funcionário ativado.');
    await loadUsers({ silent: true, force: true });
  } catch (error) {
    setStatus(friendly(error));
  }
}

function startRealtimeUpdates() {
  if (usersRefreshTimer) window.clearInterval(usersRefreshTimer);
  usersRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void loadUsers({ silent: true });
  }, REALTIME_INTERVAL_MS);

  window.addEventListener('focus', () => void loadUsers({ silent: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadUsers({ silent: true });
  });
  window.addEventListener('pagehide', () => {
    if (usersRefreshTimer) window.clearInterval(usersRefreshTimer);
  });
}

function bindEvents() {
  get('user-access-profile')?.addEventListener('change', updateProfileHelp);
  get('employee-form')?.addEventListener('submit', saveUser);
  get('new-user-button')?.addEventListener('click', newUser);
  get('close-employee-modal')?.addEventListener('click', closeUserModal);
  get('cancel-user-button')?.addEventListener('click', closeUserModal);
  get('employee-form-panel')?.addEventListener('click', (event) => {
    if (event.target === get('employee-form-panel')) closeUserModal();
  });

  get('manage-permissions-button')?.addEventListener('click', () => void openPermissionsModal());
  get('new-inline-profile-button')?.addEventListener('click', () => void openPermissionsModal());
  get('close-permissions-modal')?.addEventListener('click', closePermissionsModal);
  get('permissions-manager-modal')?.addEventListener('click', (event) => {
    if (event.target === get('permissions-manager-modal')) closePermissionsModal();
  });
  get('new-access-profile-button')?.addEventListener('click', () => openPermissionsEditor());
  get('close-access-profile-modal')?.addEventListener('click', closePermissionsEditor);
  get('access-profile-modal')?.addEventListener('click', (event) => {
    if (event.target === get('access-profile-modal')) closePermissionsEditor();
  });
  get('cancel-access-profile-button')?.addEventListener('click', closePermissionsEditor);
  get('access-profile-form')?.addEventListener('submit', saveAccessProfile);
}

async function init() {
  bindEvents();
  if (!usersToken) {
    setStatus('Faça login no painel antes de acessar funcionários.');
    return;
  }

  try {
    await loadAccessProfiles();
  } catch (error) {
    setStatus(friendly(error));
  }

  await loadUsers({ force: true });
  startRealtimeUpdates();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}
