const SH = window.location.hostname || 'localhost';
const SAPI = localStorage.getItem('apiBaseUrl') || `http://${SH}:3004`;
const STOKEN = localStorage.getItem('academiaToken') || '';
const s = (id) => document.getElementById(id);
let rows = [];
let signupRefreshTimer = null;
let currentPage = 1;
let pageSize = 10;

async function call(path, options = {}) {
  const response = await fetch(`${SAPI}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function button(text, handler, disabled = false) {
  const b = document.createElement('button');
  b.className = 'mini-button';
  b.textContent = text;
  b.disabled = disabled;
  b.onclick = handler;
  return b;
}

function dateTime(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

async function deny(item) {
  if (!window.confirm(`Negar a solicitação de ${item.name}?`)) return;
  try {
    await call('/api/signups/cancel', { method: 'POST', body: JSON.stringify({ enrollment_id: item.id }) });
    await load();
  } catch (error) {
    s('signup-status').textContent = `Não foi possível negar a solicitação: ${error.message}`;
  }
}

function render() {
  const list = s('signup-list');
  const term = (s('signup-search').value || '').toLowerCase();
  list.innerHTML = '';
  const filtered = rows.filter((item) => `${item.name} ${item.plan_name || ''} ${item.status} ${item.payment_status || ''} ${item.enrollment_code || ''}`.toLowerCase().includes(term));
  s('signup-count').textContent = `${filtered.length}`;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  for (const item of visibleRows) {
    const li = document.createElement('li');
    li.className = 'signup-card';
    const emailStatus = item.email ? (item.email_confirmed_at ? 'E-mail confirmado' : 'Aguardando e-mail') : 'Sem e-mail';
    const paymentStatus = item.payment_status === 'paid'
      ? 'Pagamento confirmado'
      : item.payment_status === 'failed' ? 'Pagamento falhou' : 'Pagamento pendente';
    const content = document.createElement('div');
    content.className = 'signup-card-content';
    const title = document.createElement('strong');
    title.textContent = item.name || 'Interessado';
    const details = document.createElement('span');
    details.textContent = `${item.plan_name || 'Sem plano'} · ${money(item.price_cents)} · ${paymentStatus}`;
    const meta = document.createElement('small');
    const statusLabel = item.status === 'confirmed' ? 'Confirmada' : item.status === 'cancelled' ? 'Negada' : 'Aguardando confirmação';
    meta.textContent = `${statusLabel} · ${emailStatus} · Solicitação recebida em ${dateTime(item.created_at)} · Código ${item.enrollment_code || '-'}`;
    content.append(title, details, meta);
    const paymentTag = document.createElement('span');
    paymentTag.className = `signup-payment-tag ${item.payment_status === 'paid' ? 'paid' : item.payment_status === 'failed' ? 'failed' : 'pending'}`;
    paymentTag.textContent = paymentStatus;
    content.appendChild(paymentTag);
    const actions = document.createElement('div');
    actions.className = 'signup-card-actions';
    actions.appendChild(button('Ver código/QR', () => showQr(item), item.status !== 'confirmed'));
    if (item.status === 'pending') actions.appendChild(button('Negar', () => deny(item)));
    li.append(content, actions);
    list.appendChild(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma solicitação encontrada.';
    list.appendChild(li);
  }
  renderPagination(filtered.length, totalPages);
}

function renderPagination(total, totalPages) {
  const container = s('signup-pagination');
  if (!container) return;
  container.innerHTML = '';
  if (!total) return;

  const size = document.createElement('label');
  size.className = 'signup-page-size';
  size.append('Por página');
  const select = document.createElement('select');
  for (const optionValue of [10, 15, 20, 50, 100]) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === pageSize;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    pageSize = Number(select.value) || 10;
    currentPage = 1;
    render();
  });
  size.appendChild(select);

  const pages = document.createElement('div');
  pages.className = 'signup-page-buttons';
  for (let page = 1; page <= totalPages; page += 1) {
    const pageButton = button(String(page), () => { currentPage = page; render(); });
    pageButton.classList.toggle('current', page === currentPage);
    pageButton.setAttribute('aria-label', `Página ${page}`);
    pages.appendChild(pageButton);
  }
  container.append(size, pages);
}

async function load() {
  try {
    const result = await call('/api/signups');
    rows = result.data || [];
    currentPage = Math.min(currentPage, Math.max(1, Math.ceil(rows.length / pageSize)));
    render();
    s('signup-status').textContent = '';
  } catch (error) {
    if (s('signup-status')) s('signup-status').textContent = `Erro: ${error.message}`;
  }
}

function startRealtime() {
  if (signupRefreshTimer) window.clearInterval(signupRefreshTimer);
  signupRefreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
  window.addEventListener('pagehide', () => window.clearInterval(signupRefreshTimer), { once: true });
}

function showQr(item) {
  const code = item.enrollment_code || '';
  s('qr-name').textContent = `${item.name} | ${item.plan_name || 'sem plano'} | ${money(item.price_cents)}`;
  s('qr-code').textContent = code;
  s('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(code)}`;
  s('qr-modal').classList.remove('hidden');
}

function closeQr() {
  s('qr-modal').classList.add('hidden');
}

async function checkCode() {
  try {
    const code = encodeURIComponent(s('check-code').value.trim());
    const result = await call(`/api/signups/check?code=${code}`);
    s('check-code-status').textContent = result.valid ? `Código válido para ${result.data.name}` : `Código encontrado, mas ainda não liberado. Status: ${result.data.status}`;
  } catch (error) {
    s('check-code-status').textContent = `Código inválido: ${error.message}`;
  }
}

s('signup-search-toggle').onclick = () => {
  const wrap = document.querySelector('.signup-search-wrap');
  const isHidden = wrap.classList.toggle('hidden');
  if (!isHidden) s('signup-search').focus();
};
s('signup-search').oninput = () => { currentPage = 1; render(); };
s('check-code-button').onclick = checkCode;
s('close-qr-modal').onclick = closeQr;
load();
startRealtime();
