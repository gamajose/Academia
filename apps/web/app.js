const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://localhost:3004';
let token = localStorage.getItem('academiaToken') || '';
let members = [];
let plans = [];
let memberships = [];
let payments = [];

const byId = (id) => document.getElementById(id);

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function message(text) {
  const element = byId('action-message');
  if (element) element.textContent = text;
}

function fillSelect(elementId, rows, getLabel, emptyText) {
  const select = byId(elementId);
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = emptyText;
  select.appendChild(empty);
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = getLabel(row);
    select.appendChild(option);
  }
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
    byId('login-message').textContent = '';
    await refreshDashboard();
  } catch (error) {
    byId('login-message').textContent = 'Falha no login';
  }
}

function logout() {
  localStorage.removeItem('academiaToken');
  token = '';
  byId('login-card').classList.remove('hidden');
  byId('dashboard').classList.add('hidden');
}

async function refreshDashboard() {
  const summary = await request('/api/dashboard/summary');
  byId('active-members').textContent = summary.active_members || 0;
  byId('active-plans').textContent = summary.active_plans || 0;
  byId('active-memberships').textContent = summary.active_memberships || 0;
  byId('today-checkins').textContent = summary.today_checkins || 0;
  byId('pending-payments').textContent = summary.pending_payments || 0;
  await Promise.all([loadMembers(), loadPlans(), loadMemberships(), loadPayments()]);
}

async function loadMembers() {
  const result = await request('/api/members');
  members = result.data || [];
  const list = byId('members-list');
  list.innerHTML = '';
  for (const member of members) {
    const item = document.createElement('li');
    item.textContent = `${member.name} - ${member.status}`;
    list.appendChild(item);
  }
  fillSelect('membership-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('payment-member', members, (m) => m.name, 'Selecione o aluno');
}

async function loadPlans() {
  const result = await request('/api/plans');
  plans = result.data || [];
  const list = byId('plans-list');
  list.innerHTML = '';
  for (const plan of plans) {
    const item = document.createElement('li');
    item.textContent = `${plan.name} - ${money(plan.price_cents)} / ${plan.duration_days} dias`;
    list.appendChild(item);
  }
  fillSelect('membership-plan', plans, (p) => `${p.name} - ${money(p.price_cents)}`, 'Selecione o plano');
}

async function loadMemberships() {
  const result = await request('/api/memberships');
  memberships = result.data || [];
  const list = byId('memberships-list');
  list.innerHTML = '';
  for (const membership of memberships) {
    const item = document.createElement('li');
    item.textContent = `${membership.member_name} - ${membership.plan_name} - ate ${membership.ends_at}`;
    list.appendChild(item);
  }
  fillSelect('payment-membership', memberships, (m) => `${m.member_name} - ${m.plan_name}`, 'Sem matricula vinculada');
}

async function loadPayments() {
  const result = await request('/api/payments');
  payments = result.data || [];
  const list = byId('payments-list');
  list.innerHTML = '';
  for (const payment of payments) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'mini-button';
    button.textContent = payment.status === 'paid' ? 'Pago' : 'Marcar pago';
    button.disabled = payment.status === 'paid';
    button.addEventListener('click', () => markPaymentPaid(payment.id));
    item.append(`${payment.member_name} - ${money(payment.amount_cents)} - ${payment.status} - venc. ${payment.due_date} `, button);
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
  message('Aluno cadastrado.');
  await refreshDashboard();
}

async function createPlan() {
  await request('/api/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: byId('plan-name').value.trim(),
      price_cents: Number(byId('plan-price').value || 0),
      duration_days: Number(byId('plan-days').value || 30)
    })
  });
  byId('plan-name').value = '';
  byId('plan-price').value = '';
  byId('plan-days').value = '';
  message('Plano cadastrado.');
  await refreshDashboard();
}

async function createMembership() {
  await request('/api/memberships', {
    method: 'POST',
    body: JSON.stringify({
      member_id: byId('membership-member').value,
      plan_id: byId('membership-plan').value,
      starts_at: byId('membership-start').value || undefined
    })
  });
  byId('membership-start').value = '';
  message('Matricula criada.');
  await refreshDashboard();
}

async function createPayment() {
  await request('/api/payments', {
    method: 'POST',
    body: JSON.stringify({
      member_id: byId('payment-member').value,
      membership_id: byId('payment-membership').value || null,
      amount_cents: Number(byId('payment-amount').value || 0),
      due_date: byId('payment-due').value
    })
  });
  byId('payment-amount').value = '';
  byId('payment-due').value = '';
  message('Cobranca criada.');
  await refreshDashboard();
}

async function markPaymentPaid(paymentId) {
  await request('/api/payments/mark-paid', {
    method: 'POST',
    body: JSON.stringify({ payment_id: paymentId })
  });
  message('Pagamento baixado.');
  await refreshDashboard();
}

byId('login-button').addEventListener('click', login);
byId('logout-button').addEventListener('click', logout);
byId('refresh-button').addEventListener('click', refreshDashboard);
byId('create-member-button').addEventListener('click', createMember);
byId('create-plan-button').addEventListener('click', createPlan);
byId('create-membership-button').addEventListener('click', createMembership);
byId('create-payment-button').addEventListener('click', createPayment);

checkHealth();
if (token) {
  byId('login-card').classList.add('hidden');
  byId('dashboard').classList.remove('hidden');
  refreshDashboard().catch(() => logout());
}
