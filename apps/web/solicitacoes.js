const SH = window.location.hostname || 'localhost';
const SAPI = localStorage.getItem('apiBaseUrl') || `http://${SH}:3004`;
const STOKEN = localStorage.getItem('academiaToken') || '';
const s = (id) => document.getElementById(id);
let rows = [];

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
  const filtered = rows.filter((item) => `${item.name} ${item.plan_name || ''} ${item.status} ${item.enrollment_code || ''}`.toLowerCase().includes(term));
  s('signup-count').textContent = `${filtered.length}`;
  for (const item of filtered) {
    const li = document.createElement('li');
    li.className = 'signup-card';
    const emailStatus = item.email ? (item.email_confirmed_at ? 'e-mail confirmado' : 'aguardando e-mail') : 'sem e-mail';
    const paymentStatus = item.payment_status === 'paid' ? 'pagamento confirmado' : `pagamento ${item.payment_status || 'pendente'}`;
    const content = document.createElement('div');
    content.className = 'signup-card-content';
    const title = document.createElement('strong');
    title.textContent = item.name || 'Interessado';
    const details = document.createElement('span');
    details.textContent = `${item.plan_name || 'Sem plano'} · ${money(item.price_cents)} · ${paymentStatus}`;
    const meta = document.createElement('small');
    const statusLabel = item.status === 'confirmed' ? 'confirmada' : item.status === 'cancelled' ? 'negada' : 'aguardando confirmação';
    meta.textContent = `${statusLabel} · ${emailStatus} · Solicitação recebida em ${dateTime(item.created_at)} · Código ${item.enrollment_code || '-'}`;
    content.append(title, details, meta);
    const actions = document.createElement('div');
    actions.className = 'signup-card-actions';
    actions.appendChild(button('Ver código/QR', () => showQr(item), item.status !== 'confirmed'));
    if (item.status !== 'confirmed' && item.status !== 'cancelled') actions.appendChild(button('Negar', () => deny(item)));
    li.append(content, actions);
    list.appendChild(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma solicitação encontrada.';
    list.appendChild(li);
  }
}

async function load() {
  try {
    const result = await call('/api/signups');
    rows = result.data || [];
    render();
    s('signup-status').textContent = '';
  } catch (error) {
    if (s('signup-status')) s('signup-status').textContent = `Erro: ${error.message}`;
  }
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

s('reload-signups').onclick = load;
s('signup-search').oninput = render;
s('check-code-button').onclick = checkCode;
s('close-qr-modal').onclick = closeQr;
load();
