const defaultApiHost = window.location.hostname || 'localhost';
const API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${defaultApiHost}:3004`;
let token = localStorage.getItem('academiaToken') || '';
let members = [];
let plans = [];
let memberships = [];
let payments = [];
let checkins = [];

const byId = (id) => document.getElementById(id);

function setPortalAccess() {
  if (token) document.cookie = `academiaAuth=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

function clearPortalAccess() {
  document.cookie = 'academiaAuth=; Path=/; Max-Age=0; SameSite=Lax';
}


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

function currencyToCents(value) {
  const normalized = String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function message(text) {
  const element = byId('action-message');
  if (element) element.textContent = text;
}

function errorText(error) {
  const code = error.message || 'erro';
  const map = {
    credenciais_invalidas: 'E-mail ou senha invalido.',
    nao_autorizado: 'Sessao expirada. Faca login novamente.',
    acesso_negado: 'Seu perfil nao tem acesso a esta area.',
    json_invalido: 'Dados invalidos. Revise os campos.',
    nome_obrigatorio: 'Informe o nome antes de salvar.',
    dados_invalidos: 'Confira os campos obrigatorios.',
    aluno_nao_encontrado: 'Aluno nao encontrado.',
    plano_nao_encontrado: 'Plano nao encontrado.',
    matricula_nao_encontrada: 'Matricula nao encontrada.',
    pagamento_nao_encontrado_ou_ja_pago: 'Pagamento nao encontrado ou ja baixado.',
    erro_requisicao: 'Erro na requisicao.'
  };
  return map[code] || `Erro: ${code}`;
}

async function runAction(fn, successText) {
  try {
    await fn();
    message(successText);
    await refreshDashboard();
  } catch (error) {
    message(errorText(error));
  }
}

function makeButton(text, onClick, disabled = false) {
  const button = document.createElement('button');
  button.className = 'mini-button';
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function fillSelect(elementId, rows, getLabel, emptyText) {
  const select = byId(elementId);
  if (!select) return;
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
  const apiUrl = byId('api-url');
  if (apiUrl) apiUrl.textContent = '';
  try {
    const health = await request('/health');
    const status = byId('api-status');
    if (status) status.textContent = health.status === 'ok' ? 'online' : 'verificar';
  } catch (error) {
    const status = byId('api-status');
    if (status) status.textContent = 'offline';
  }
}

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function goPanel() {
  window.location.href = './painel.html';
}

async function login() {
  const email = byId('email').value.trim();
  const password = byId('password').value;
  byId('login-message').textContent = 'validando...';
  try {
    const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = data.token;
    localStorage.setItem('academiaToken', token);
    setPortalAccess();
    if (currentPage() === 'admin.html') return goPanel();
    byId('login-card').classList.add('hidden');
    byId('dashboard').classList.remove('hidden');
    byId('login-message').textContent = '';
    await refreshDashboard();
  } catch (error) {
    byId('login-message').textContent = errorText(error);
  }
}

function logout() {
  localStorage.removeItem('academiaToken');
  clearPortalAccess();
  token = '';
  if (currentPage() !== 'admin.html') {
    window.location.href = './admin.html';
    return;
  }
  if (byId('login-card')) byId('login-card').classList.remove('hidden');
  if (byId('dashboard')) byId('dashboard').classList.add('hidden');
}

async function refreshDashboard() {
  const summary = await request('/api/dashboard/summary');
  if (byId('active-members')) byId('active-members').textContent = summary.active_members || 0;
  if (byId('active-plans')) byId('active-plans').textContent = summary.active_plans || 0;
  if (byId('active-memberships')) byId('active-memberships').textContent = summary.active_memberships || 0;
  if (byId('today-checkins')) byId('today-checkins').textContent = summary.today_checkins || 0;
  if (byId('pending-payments')) byId('pending-payments').textContent = summary.pending_payments || 0;
  await Promise.all([loadMembers(), loadPlans(), loadMemberships(), loadPayments(), loadCheckins()]);
}

async function loadMembers() {
  const result = await request('/api/members');
  members = result.data || [];
  const list = byId('members-list');
  if (list) {
    list.innerHTML = '';
    for (const member of members) {
      const item = document.createElement('li');
      item.append(`${member.name} - ${member.status} `);
      item.appendChild(makeButton('Editar', () => editMember(member)));
      item.appendChild(makeButton(member.status === 'active' ? 'Desativar' : 'Ativar', () => toggleMember(member)));
      list.appendChild(item);
    }
  }
  fillSelect('membership-member', members.filter((m) => m.status === 'active'), (m) => m.name, 'Selecione o aluno');
  fillSelect('payment-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('checkin-member', members.filter((m) => m.status === 'active'), (m) => m.name, 'Selecione o aluno');
}

async function loadPlans() {
  const result = await request('/api/plans');
  plans = result.data || [];
  const list = byId('plans-list');
  if (list) {
    list.innerHTML = '';
    for (const plan of plans) {
      const item = document.createElement('li');
      item.append(`${plan.name} - ${money(plan.price_cents)} / ${plan.duration_days} dias - ${plan.is_active ? 'ativo' : 'inativo'} `);
      item.appendChild(makeButton('Editar', () => editPlan(plan)));
      item.appendChild(makeButton(plan.is_active ? 'Desativar' : 'Ativar', () => togglePlan(plan)));
      list.appendChild(item);
    }
  }
  fillSelect('membership-plan', plans.filter((p) => p.is_active), (p) => `${p.name} - ${money(p.price_cents)}`, 'Selecione o plano');
}

async function loadMemberships() {
  const result = await request('/api/memberships');
  memberships = result.data || [];
  const list = byId('memberships-list');
  if (list) {
    list.innerHTML = '';
    for (const membership of memberships) {
      const item = document.createElement('li');
      item.append(`${membership.member_name} - ${membership.plan_name} - ${membership.status} - ate ${membership.ends_at} `);
      item.appendChild(makeButton('Cancelar', () => cancelMembership(membership), membership.status !== 'active'));
      list.appendChild(item);
    }
  }
  fillSelect('payment-membership', memberships.filter((m) => m.status === 'active'), (m) => `${m.member_name} - ${m.plan_name}`, 'Sem matricula vinculada');
}

async function loadPayments() {
  const result = await request('/api/payments');
  payments = result.data || [];
  const list = byId('payments-list');
  if (!list) return;
  list.innerHTML = '';
  for (const payment of payments) {
    const item = document.createElement('li');
    item.append(`${payment.member_name} - ${money(payment.amount_cents)} - ${payment.status} - venc. ${payment.due_date} `);
    item.appendChild(makeButton('Marcar pago', () => markPaymentPaid(payment.id), payment.status !== 'pending'));
    item.appendChild(makeButton('Cancelar', () => cancelPayment(payment), payment.status !== 'pending'));
    list.appendChild(item);
  }
}

async function loadCheckins() {
  const result = await request('/api/checkins/recent');
  checkins = result.data || [];
  const list = byId('checkins-list');
  if (!list) return;
  list.innerHTML = '';
  for (const checkin of checkins) {
    const item = document.createElement('li');
    item.textContent = `${checkin.member_name} - ${new Date(checkin.checked_at).toLocaleString('pt-BR')} - ${checkin.source}`;
    list.appendChild(item);
  }
}

async function createMember() {
  await runAction(async () => {
    await request('/api/members', { method: 'POST', body: JSON.stringify({ name: byId('member-name').value.trim(), email: byId('member-email').value.trim() || null, phone: byId('member-phone').value.trim() || null }) });
    byId('member-name').value = ''; byId('member-email').value = ''; byId('member-phone').value = '';
  }, 'Aluno cadastrado.');
}

async function editMember(member) {
  const name = prompt('Nome do aluno', member.name);
  if (!name) return;
  const email = prompt('E-mail do aluno', member.email || '') || '';
  const phone = prompt('Telefone do aluno', member.phone || '') || '';
  await runAction(() => request('/api/members/update', { method: 'POST', body: JSON.stringify({ member_id: member.id, name, email, phone }) }), 'Aluno atualizado.');
}

async function toggleMember(member) {
  const action = member.status === 'active' ? 'deactivate' : 'activate';
  await runAction(() => request(`/api/members/${action}`, { method: 'POST', body: JSON.stringify({ member_id: member.id }) }), member.status === 'active' ? 'Aluno desativado.' : 'Aluno ativado.');
}

async function createPlan() {
  await runAction(async () => {
    await request('/api/plans', { method: 'POST', body: JSON.stringify({ name: byId('plan-name').value.trim(), price_cents: currencyToCents(byId('plan-price').value), duration_days: Number(byId('plan-days').value || 30) }) });
    byId('plan-name').value = ''; byId('plan-price').value = ''; byId('plan-days').value = '';
  }, 'Plano cadastrado.');
}

async function editPlan(plan) {
  const name = prompt('Nome do plano', plan.name);
  if (!name) return;
  const price = prompt('Preço em reais', (Number(plan.price_cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  const days = prompt('Duracao em dias', plan.duration_days);
  await runAction(() => request('/api/plans/update', { method: 'POST', body: JSON.stringify({ plan_id: plan.id, name, price_cents: currencyToCents(price || Number(plan.price_cents || 0) / 100), duration_days: Number(days || plan.duration_days) }) }), 'Plano atualizado.');
}

async function togglePlan(plan) {
  const action = plan.is_active ? 'deactivate' : 'activate';
  await runAction(() => request(`/api/plans/${action}`, { method: 'POST', body: JSON.stringify({ plan_id: plan.id }) }), plan.is_active ? 'Plano desativado.' : 'Plano ativado.');
}

async function createMembership() {
  await runAction(async () => {
    await request('/api/memberships', { method: 'POST', body: JSON.stringify({ member_id: byId('membership-member').value, plan_id: byId('membership-plan').value, starts_at: byId('membership-start').value || undefined }) });
    byId('membership-start').value = '';
  }, 'Matricula criada.');
}

async function cancelMembership(membership) {
  if (!confirm(`Cancelar matricula de ${membership.member_name}?`)) return;
  await runAction(() => request('/api/memberships/cancel', { method: 'POST', body: JSON.stringify({ membership_id: membership.id }) }), 'Matricula cancelada.');
}

async function createPayment() {
  await runAction(async () => {
    await request('/api/payments', { method: 'POST', body: JSON.stringify({ member_id: byId('payment-member').value, membership_id: byId('payment-membership').value || null, amount_cents: currencyToCents(byId('payment-amount').value), due_date: byId('payment-due').value }) });
    byId('payment-amount').value = ''; byId('payment-due').value = '';
  }, 'Cobranca criada.');
}

async function markPaymentPaid(paymentId) {
  await runAction(() => request('/api/payments/mark-paid', { method: 'POST', body: JSON.stringify({ payment_id: paymentId }) }), 'Pagamento baixado.');
}

async function cancelPayment(payment) {
  if (!confirm(`Cancelar cobranca de ${payment.member_name}?`)) return;
  await runAction(() => request('/api/payments/cancel', { method: 'POST', body: JSON.stringify({ payment_id: payment.id }) }), 'Cobranca cancelada.');
}

async function createCheckin() {
  await runAction(() => request('/api/checkins', { method: 'POST', body: JSON.stringify({ member_id: byId('checkin-member').value, source: 'web' }) }), 'Check-in registrado.');
}

function bind(id, event, handler) { const el = byId(id); if (el) el.addEventListener(event, handler); }
bind('login-button', 'click', login);
bind('create-member-button', 'click', createMember);
bind('create-plan-button', 'click', createPlan);
bind('create-membership-button', 'click', createMembership);
bind('create-payment-button', 'click', createPayment);
bind('create-checkin-button', 'click', createCheckin);

checkHealth();
if (token) setPortalAccess();
if (token && currentPage() === 'admin.html') goPanel();
if (token && byId('login-card') && byId('dashboard')) {
  byId('login-card').classList.add('hidden');
  byId('dashboard').classList.remove('hidden');
  refreshDashboard().catch(() => logout());
}
