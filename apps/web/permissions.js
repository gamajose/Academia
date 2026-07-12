const permissionsHost = window.location.hostname || 'localhost';
const PERMISSIONS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${permissionsHost}:3004`;
const permissionsToken = localStorage.getItem('academiaToken') || '';
const byId = (id) => document.getElementById(id);
let profiles = [];
let permissionKeys = [];

const moduleLabels = {
  dashboard: 'Painel', members: 'Alunos', plans: 'Planos', memberships: 'Matrículas',
  pre_enrollments: 'Pré-matrículas', finance: 'Financeiro', alerts: 'Alertas',
  training: 'Treinos', assessments: 'Avaliações', student_access: 'Acesso do aluno',
  users: 'Funcionários e usuários', account: 'Perfil e conta', reports: 'Relatórios',
  access: 'Controle de acesso', classes: 'Aulas', settings: 'Configurações',
  audit: 'Auditoria', exports: 'Exportações'
};

function setStatus(text) { byId('access-profiles-status').textContent = text; }

function friendly(error) {
  const messages = {
    sem_permissao: 'Seu perfil não pode gerenciar permissões.',
    perfil_invalido: 'Informe um nome válido para o perfil.',
    perfil_ja_cadastrado: 'Já existe um perfil com esse nome.',
    perfil_nao_encontrado: 'Perfil não encontrado.',
    perfil_em_uso: 'Esse perfil está vinculado a funcionários. Troque o perfil deles antes de excluir ou desativar.',
    not_found: 'A API de perfis ainda não foi atualizada. Aguarde o deploy da versão mais recente.'
  };
  return messages[error.message] || `Erro: ${error.message}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${PERMISSIONS_API_BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${permissionsToken}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function renderPermissionInputs(selected = {}) {
  const grid = byId('permissions-grid'); grid.innerHTML = '';
  if (!permissionKeys.length) { const empty = document.createElement('span'); empty.className = 'permissions-loading'; empty.textContent = 'Nenhum módulo disponível.'; grid.appendChild(empty); return; }
  for (const key of permissionKeys) {
    const label = document.createElement('label'); label.className = 'permission-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.permission = key; input.checked = selected[key] === true;
    label.append(input, document.createTextNode(moduleLabels[key] || key)); grid.appendChild(label);
  }
}

function readPermissions() {
  return Object.fromEntries([...document.querySelectorAll('[data-permission]')].map((input) => [input.dataset.permission, input.checked]));
}

function renderProfiles() {
  const list = byId('access-profile-list'); list.innerHTML = '';
  if (!profiles.length) { list.innerHTML = '<p class="empty-state">Nenhum perfil cadastrado.</p>'; return; }
  for (const profile of profiles) {
    const card = document.createElement('article'); card.className = 'access-profile-card';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = profile.name; info.appendChild(title);
    const modules = Object.entries(profile.permissions || {}).filter(([, enabled]) => enabled).map(([key]) => moduleLabels[key] || key);
    const summary = document.createElement('small'); summary.textContent = `${modules.length} módulo(s) liberado(s)`; info.appendChild(summary);
    const details = document.createElement('p'); details.textContent = modules.join(' · ') || 'Nenhum módulo liberado'; info.appendChild(details);
    if (!profile.is_active) { const inactive = document.createElement('small'); inactive.className = 'profile-status-inactive'; inactive.textContent = 'Inativo'; info.appendChild(inactive); }
    const actions = document.createElement('div'); actions.className = 'access-profile-actions';
    const edit = document.createElement('button'); edit.className = 'mini-button secondary'; edit.type = 'button'; edit.textContent = 'Editar'; edit.onclick = () => openEditor(profile); actions.appendChild(edit);
    const toggle = document.createElement('button'); toggle.className = 'mini-button'; toggle.type = 'button'; toggle.textContent = profile.is_active ? 'Desativar' : 'Ativar'; toggle.onclick = () => toggleProfile(profile); actions.appendChild(toggle);
    const remove = document.createElement('button'); remove.className = 'mini-button secondary'; remove.type = 'button'; remove.textContent = 'Excluir'; remove.onclick = () => deleteProfile(profile); actions.appendChild(remove);
    card.append(info, actions); list.appendChild(card);
  }
}

function openEditor(profile = null) {
  byId('access-profile-form').classList.remove('hidden');
  byId('access-profile-id').value = profile?.id || '';
  byId('access-profile-name').value = profile?.name || '';
  renderPermissionInputs(profile?.permissions || {});
  byId('access-profile-name').focus();
}

function closeEditor() { byId('access-profile-form').classList.add('hidden'); byId('access-profile-form').reset(); renderPermissionInputs(); }

async function loadProfiles() {
  const result = await api('/api/access-profiles');
  profiles = result.data || []; permissionKeys = result.permission_keys || Object.keys(moduleLabels); renderProfiles();
}

async function saveProfile(event) {
  event.preventDefault();
  const id = byId('access-profile-id').value;
  const profile = profiles.find((item) => item.id === id);
  const payload = { id: id || undefined, name: byId('access-profile-name').value.trim(), role_key: profile?.role_key || 'staff', permissions: readPermissions() };
  try {
    await api(id ? '/api/access-profiles/update' : '/api/access-profiles', { method: 'POST', body: JSON.stringify(payload) });
    closeEditor(); await loadProfiles(); setStatus('Perfil salvo com sucesso.');
  } catch (error) { setStatus(friendly(error)); }
}

async function toggleProfile(profile) {
  try {
    await api('/api/access-profiles/update', { method: 'POST', body: JSON.stringify({ id: profile.id, name: profile.name, role_key: profile.role_key, permissions: profile.permissions, is_active: !profile.is_active }) });
    await loadProfiles(); setStatus(profile.is_active ? 'Perfil desativado.' : 'Perfil ativado.');
  } catch (error) { setStatus(friendly(error)); }
}

async function deleteProfile(profile) {
  if (!window.confirm(`Excluir o perfil "${profile.name}"?`)) return;
  try { await api('/api/access-profiles', { method: 'DELETE', body: JSON.stringify({ id: profile.id }) }); await loadProfiles(); setStatus('Perfil excluído.'); }
  catch (error) { setStatus(friendly(error)); }
}

byId('new-access-profile-button').addEventListener('click', () => openEditor());
byId('cancel-access-profile-button').addEventListener('click', closeEditor);
byId('access-profile-form').addEventListener('submit', saveProfile);

(async function init() {
  if (!permissionsToken) { setStatus('Faça login no painel antes de gerenciar permissões.'); return; }
  try { await loadProfiles(); setStatus('Perfis carregados.'); }
  catch (error) { setStatus(friendly(error)); }
})();
