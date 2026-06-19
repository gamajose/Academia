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
  setAccessStatus('Alunos carregados.');
}

async function saveMemberAccess() {
  try {
    await callAdmin('/api/student/accounts', {
      method: 'POST',
      body: JSON.stringify({
        member_id: el('account-member').value,
        email: el('account-email').value.trim(),
        access_key: el('account-secret').value
      })
    });
    el('account-email').value = '';
    el('account-secret').value = '';
    setAccessStatus('Acesso do aluno salvo.');
  } catch (error) {
    setAccessStatus(`Erro: ${error.message}`);
  }
}

el('create-student-account-button').addEventListener('click', saveMemberAccess);
loadMembersForAccess().catch((error) => setAccessStatus(`Erro: ${error.message}`));
