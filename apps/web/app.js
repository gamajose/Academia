const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://localhost:3004';
let token = localStorage.getItem('academiaToken') || '';

const byId = (id) => document.getElementById(id);

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

async function checkHealth() {
  try {
    const health = await request('/health');
    byId('api-status').textContent = `${health.status} ${health.version || ''}`.trim();
  } catch (error) {
    byId('api-status').textContent = 'offline';
  }
}

async function login() {
  const email = byId('email').value.trim();
  const password = byId('password').value;
  byId('login-message').textContent = 'validando...';

  try {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    localStorage.setItem('academiaToken', token);
    byId('login-card').classList.add('hidden');
    byId('dashboard').classList.remove('hidden');
    await refreshDashboard();
  } catch (error) {
    byId('login-message').textContent = 'Falha no login';
  }
}

async function refreshDashboard() {
  const summary = await request('/api/dashboard/summary');
  byId('active-members').textContent = summary.active_members || 0;
  byId('active-plans').textContent = summary.active_plans || 0;
  byId('active-memberships').textContent = summary.active_memberships || 0;
  byId('today-checkins').textContent = summary.today_checkins || 0;
  byId('pending-payments').textContent = summary.pending_payments || 0;
  await loadMembers();
}

async function loadMembers() {
  const result = await request('/api/members');
  const list = byId('members-list');
  list.innerHTML = '';
  for (const member of result.data || []) {
    const item = document.createElement('li');
    item.textContent = `${member.name} - ${member.status}`;
    list.appendChild(item);
  }
}

async function createMember() {
  await request('/api/members', {
    method: 'POST',
    body: JSON.stringify({
      name: byId('member-name').value.trim(),
      email: byId('member-email').value.trim() || null,
      phone: byId('member-phone').value.trim() || null
    })
  });
  byId('member-name').value = '';
  byId('member-email').value = '';
  byId('member-phone').value = '';
  await refreshDashboard();
}

byId('login-button').addEventListener('click', login);
byId('refresh-button').addEventListener('click', refreshDashboard);
byId('create-member-button').addEventListener('click', createMember);

checkHealth();
if (token) {
  byId('login-card').classList.add('hidden');
  byId('dashboard').classList.remove('hidden');
  refreshDashboard().catch(() => {
    localStorage.removeItem('academiaToken');
    token = '';
    byId('login-card').classList.remove('hidden');
    byId('dashboard').classList.add('hidden');
  });
}
