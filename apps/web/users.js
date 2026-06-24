const usersHost = window.location.hostname || 'localhost';
const USERS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${usersHost}:3004`;
const usersToken = localStorage.getItem('academiaToken') || '';

const get = (id) => document.getElementById(id);

function setStatus(text) {
  get('users-status').textContent = text;
}

function friendly(error) {
  const messages = {
    sem_permissao: 'Apenas owner pode gerenciar usuarios.',
    acesso_negado: 'Apenas owner pode gerenciar usuarios.',
    dados_invalidos: 'Preencha os campos obrigatorios.',
    email_ja_cadastrado: 'E-mail ja cadastrado.',
    usuario_nao_encontrado: 'Usuario nao encontrado.',
    nao_pode_desativar_proprio_usuario: 'Nao e permitido desativar o proprio usuario.'
  };
  return messages[error.message] || `Erro: ${error.message}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${USERS_API_BASE_URL}${path}`, {
    ...options,
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

function actionButton(user) {
  const button = document.createElement('button');
  button.className = 'mini-button';
  button.textContent = user.is_active ? 'Desativar' : 'Ativar';
  button.addEventListener('click', () => toggleUser(user.id, user.is_active ? 'deactivate' : 'activate'));
  return button;
}

async function loadUsers() {
  if (!usersToken) {
    setStatus('Faca login no painel principal antes de acessar usuarios.');
    return;
  }

  try {
    const result = await api('/api/users');
    const table = get('users-table');
    table.innerHTML = '';
    for (const user of result.data || []) {
      const row = document.createElement('tr');
      for (const value of [user.name, user.email, user.role, user.is_active ? 'ativo' : 'inativo']) {
        const cell = document.createElement('td');
        cell.textContent = value || '';
        row.appendChild(cell);
      }
      const actions = document.createElement('td');
      actions.appendChild(actionButton(user));
      row.appendChild(actions);
      table.appendChild(row);
    }
    setStatus('Usuarios carregados.');
  } catch (error) {
    setStatus(friendly(error));
  }
}

async function createUser() {
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: get('user-name').value.trim(),
        email: get('user-email').value.trim(),
        password: get('user-password').value,
        role: get('user-role').value
      })
    });
    get('user-name').value = '';
    get('user-email').value = '';
    get('user-password').value = '';
    setStatus('Usuario criado.');
    await loadUsers();
  } catch (error) {
    setStatus(friendly(error));
  }
}

async function toggleUser(userId, action) {
  try {
    await api(`/api/users/${action}`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
    setStatus(action === 'activate' ? 'Usuario ativado.' : 'Usuario desativado.');
    await loadUsers();
  } catch (error) {
    setStatus(friendly(error));
  }
}

get('create-user-button').addEventListener('click', createUser);
get('refresh-users-button').addEventListener('click', loadUsers);
loadUsers();
