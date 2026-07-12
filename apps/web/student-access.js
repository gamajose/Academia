const memberAccessHost = window.location.hostname || 'localhost';
const MEMBER_ACCESS_API = localStorage.getItem('apiBaseUrl') || `http://${memberAccessHost}:3004`;
const MEMBER_ACCESS_TOKEN = localStorage.getItem('academiaToken') || '';
const ACCESS_REFRESH_MS = 3000;
const el = (id) => document.getElementById(id);
let accessRefreshTimer = null;
let accessRequestInFlight = false;
let lastAccountsSignature = '';

function setAccessStatus(text) {
  const target = el('student-account-status');
  if (target) target.textContent = text;
}

function setAccountsStatus(text) {
  const target = el('student-accounts-status');
  if (target) target.textContent = text;
}

async function callAdmin(path, options = {}) {
  const response = await fetch(`${MEMBER_ACCESS_API}${path}`, {
    ...options,
    cache: 'no-store',
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

function formatAccessDate(value) {
  if (!value) return 'Nunca acessou';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca acessou';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function renderAccounts(rows) {
  const list = el('student-accounts-list');
  if (!list) return;
  list.textContent = '';

  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma conta de aluno cadastrada.';
    list.appendChild(empty);
    return;
  }

  for (const account of rows) {
    const item = document.createElement('li');
    item.className = 'workflow-record';

    const main = document.createElement('div');
    main.className = 'workflow-record-main';
    const title = document.createElement('strong');
    title.textContent = account.member_name || 'Aluno';
    const email = document.createElement('span');
    email.textContent = account.email || 'Sem e-mail';
    const lastAccess = document.createElement('small');
    lastAccess.textContent = `Último acesso: ${formatAccessDate(account.last_login_at)}`;
    main.append(title, email, lastAccess);

    const actions = document.createElement('div');
    actions.className = 'workflow-record-actions';
    const button = document.createElement('button');
    button.className = account.is_active ? 'mini-button' : 'mini-button secondary';
    button.type = 'button';
    button.textContent = account.is_active ? 'Bloquear' : 'Liberar';
    button.addEventListener('click', () => toggleStudentAccount(account.id, !account.is_active));
    actions.appendChild(button);

    item.append(main, actions);
    list.appendChild(item);
  }
}

function accountsSignature(rows) {
  return JSON.stringify(rows.map((account) => [
    account.id,
    account.member_name,
    account.email,
    account.is_active,
    account.last_login_at
  ]));
}

async function loadStudentAccounts({ silent = false, force = false } = {}) {
  if (accessRequestInFlight) return;
  accessRequestInFlight = true;
  try {
    const result = await callAdmin('/api/reports/student-accounts');
    const rows = result.data || [];
    const signature = accountsSignature(rows);
    if (force || signature !== lastAccountsSignature) {
      renderAccounts(rows);
      lastAccountsSignature = signature;
    }
    if (!silent) setAccountsStatus('');
  } catch (error) {
    setAccountsStatus(`Erro: ${error.message}`);
  } finally {
    accessRequestInFlight = false;
  }
}

async function loadMembersForAccess() {
  if (!MEMBER_ACCESS_TOKEN) {
    setAccountsStatus('Entre no painel principal antes de gerenciar acessos.');
    return;
  }
  const result = await callAdmin('/api/members');
  const select = el('account-member');
  select.innerHTML = '<option value="">Selecione o aluno</option>';
  for (const member of (result.data || []).filter((item) => item.status === 'active')) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    select.appendChild(option);
  }
}

function openAccessModal() {
  const modal = el('student-account-modal');
  if (!modal) return;
  el('student-account-form')?.reset();
  setAccessStatus('');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => el('account-member')?.focus());
}

function closeAccessModal() {
  const modal = el('student-account-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  el('student-account-form')?.reset();
  setAccessStatus('');
}

async function saveMemberAccess(event) {
  event.preventDefault();
  const saveButton = el('create-student-account-button');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';
  setAccessStatus('');
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
    closeAccessModal();
    setAccountsStatus('Acesso do aluno salvo.');
    await loadStudentAccounts({ silent: true, force: true });
  } catch (error) {
    setAccessStatus(`Erro: ${error.message}`);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Salvar acesso';
  }
}

async function toggleStudentAccount(accountId, active) {
  try {
    await callAdmin('/api/reports/student-account-status', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId, is_active: active })
    });
    setAccountsStatus(active ? 'Acesso liberado.' : 'Acesso bloqueado.');
    await loadStudentAccounts({ silent: true, force: true });
  } catch (error) {
    setAccountsStatus(`Erro: ${error.message}`);
  }
}

function startRealtimeAccessUpdates() {
  if (accessRefreshTimer) window.clearInterval(accessRefreshTimer);
  accessRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void loadStudentAccounts({ silent: true });
  }, ACCESS_REFRESH_MS);
  window.addEventListener('focus', () => void loadStudentAccounts({ silent: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadStudentAccounts({ silent: true });
  });
  window.addEventListener('pagehide', () => {
    if (accessRefreshTimer) window.clearInterval(accessRefreshTimer);
  });
}

function bindAccessEvents() {
  el('open-student-account-modal')?.addEventListener('click', openAccessModal);
  el('student-account-form')?.addEventListener('submit', saveMemberAccess);
  el('close-student-account-modal')?.addEventListener('click', closeAccessModal);
  el('cancel-student-account-modal')?.addEventListener('click', closeAccessModal);
  el('student-account-modal')?.addEventListener('click', (event) => {
    if (event.target === el('student-account-modal')) closeAccessModal();
  });
}

async function initAccessPage() {
  bindAccessEvents();
  try {
    await loadMembersForAccess();
    await loadStudentAccounts({ force: true });
    startRealtimeAccessUpdates();
  } catch (error) {
    setAccountsStatus(`Erro: ${error.message}`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccessPage, { once: true });
} else {
  void initAccessPage();
}
