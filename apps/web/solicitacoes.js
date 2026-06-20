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

function render() {
  const list = s('signup-list');
  const term = (s('signup-search').value || '').toLowerCase();
  list.innerHTML = '';
  const filtered = rows.filter((item) => `${item.name} ${item.plan_name || ''} ${item.status} ${item.enrollment_code || ''}`.toLowerCase().includes(term));
  for (const item of filtered) {
    const li = document.createElement('li');
    li.append(`${item.name} | ${item.plan_name || 'sem plano'} | ${money(item.price_cents)} | ${item.status} | código ${item.enrollment_code || '-'} `);
    li.appendChild(button('Confirmar recebimento', () => approve(item), item.status === 'confirmed'));
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
    s('signup-status').textContent = 'Solicitações carregadas.';
  } catch (error) {
    s('signup-status').textContent = `Erro: ${error.message}`;
  }
}

async function approve(item) {
  if (!confirm(`Confirmar recebimento e liberar código de ${item.name}?`)) return;
  try {
    const result = await call('/api/signups/approve', { method: 'POST', body: JSON.stringify({ id: item.id }) });
    s('signup-status').textContent = `Liberado. Código: ${result.enrollment_code}`;
    await load();
  } catch (error) {
    s('signup-status').textContent = `Erro ao liberar: ${error.message}`;
  }
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
load();
