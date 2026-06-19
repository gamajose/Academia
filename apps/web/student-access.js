const memberAccessHost = window.location.hostname || 'localhost';
const MEMBER_ACCESS_API = localStorage.getItem('apiBaseUrl') || `http://${memberAccessHost}:3004`;
const MEMBER_ACCESS_TOKEN = localStorage.getItem('academiaToken') || '';
const el = (id) => document.getElementById(id);

function setAccessStatus(text) {
  el('student-account-status').textContent = text;
}

async function callAdmin(path, options = {}) {
  const response = await fetch(`${MEMBER_ACCESS_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MEMBER_ACCESS_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function renderAccounts(rows) {
  const list = el('student-accounts-list');
  list.textContent = '';
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Nenhuma conta de aluno cadastrada.';
    list.appendChild(empty);
    return;
  }
  for (const account of rows) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'mini-button secondary';
    button.textContent = account.is_active ? 'Bloquear' : 'Liberar';
    button.addEventListener('click', () => toggleStudentAccount(account.id, !account.is_active));
    li.textContent = `${account.member_name} - ${account.email} - ${account.is_active ? 'ativo' : 'bloqueado'} - ultimo acesso: ${account.last_login_at || '-'}`;
    li.appendChild(button);
    list.appendChild(li);
  }
}

async function loadStudentAccounts() {
  const result = await callAdmin('/api/reports/student-accounts');
  renderAccounts(result.data || []);
}

async function loadMembersForAccess() {
  if (!MEMBER_ACCESS_TOKEN) {
    setAccessStatus('Entre no painel principal antes de criar acesso do aluno.');
    return;
  }
  const result = await callAdmin('/api/members');
  const select = el('account-member');
  select.innerHTML = '<option value="">Selecione o aluno</option>';
  for (const member of (result.data || []).filter((m) => m.status === 'active')) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    select.appendChild(option);
  }
  await loadStudentAccounts();
  setAccessStatus('Alunos e contas carregados.');
}

async function saveMemberAccess() {
  try {
    const payload = {
      member_id: el('account-member').value,
      email: el('account-email').value.trim(),
      secret: el('account-secret').value
    };
    await callAdmin('/api/student/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    el('account-email').value = '';
    el('account-secret').value = '';
    setAccessStatus('Acesso do aluno salvo.');
    await loadStudentAccounts();
  } catch (error) {
    setAccessStatus(`Erro: ${error.message}`);
  }
}

async function toggleStudentAccount(accountId, active) {
  try {
    await callAdmin('/api/reports/student-account-status', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId, is_active: active })
    });
    setAccessStatus(active ? 'Acesso liberado.' : 'Acesso bloqueado.');
    await loadStudentAccounts();
  } catch (error) {
    setAccessStatus(`Erro: ${error.message}`);
  }
}

el('create-student-account-button').addEventListener('click', saveMemberAccess);
el('refresh-student-accounts-button').addEventListener('click', () => loadStudentAccounts().catch((error) => setAccessStatus(`Erro: ${error.message}`)));
loadMembersForAccess().catch((error) => setAccessStatus(`Erro: ${error.message}`));
