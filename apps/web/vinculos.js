const VH = window.location.hostname || 'localhost';
const VAPI = localStorage.getItem('apiBaseUrl') || `http://${VH}:3004`;
const VTOKEN = localStorage.getItem('academiaToken') || '';
const v = (id) => document.getElementById(id);
let links = [];
let members = [];
let plans = [];

async function call(path, options = {}) {
  const response = await fetch(`${VAPI}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function opt(select, rows, label) {
  select.innerHTML = '<option value="">Selecione</option>';
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = label(row);
    select.appendChild(option);
  }
}

function mini(text, fn, disabled = false) {
  const b = document.createElement('button');
  b.className = 'mini-button';
  b.textContent = text;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

function render() {
  const list = v('link-list');
  const term = (v('link-search').value || '').toLowerCase();
  list.innerHTML = '';
  const data = links.filter((item) => `${item.member_name || ''} ${item.plan_name || ''} ${item.status || ''}`.toLowerCase().includes(term));
  for (const item of data) {
    const li = document.createElement('li');
    li.append(`${item.member_name} | ${item.plan_name} | ${item.status} | ${item.starts_at} até ${item.ends_at} `);
    li.appendChild(mini('Cancelar', () => cancelLink(item), item.status !== 'active'));
    list.appendChild(li);
  }
  if (!list.children.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhuma matrícula encontrada.';
    list.appendChild(li);
  }
}

async function load() {
  try {
    const [linkResult, memberResult, planResult] = await Promise.all([
      call('/api/memberships'),
      call('/api/members'),
      call('/api/plans')
    ]);
    links = linkResult.data || [];
    members = (memberResult.data || []).filter((m) => m.status === 'active');
    plans = (planResult.data || []).filter((p) => p.is_active);
    opt(v('link-member'), members, (m) => m.name);
    opt(v('link-plan'), plans, (p) => p.name);
    render();
    v('link-status').textContent = 'Matrículas carregadas.';
  } catch (error) {
    v('link-status').textContent = `Erro: ${error.message}`;
  }
}

function openModal() {
  v('link-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => v('link-member').focus(), 50);
}

function closeModal() {
  v('link-modal').classList.add('hidden');
  document.body.style.overflow = '';
  v('link-form').reset();
}

async function save() {
  if (!v('link-form').reportValidity()) return;
  try {
    v('save-link-button').disabled = true;
    await call('/api/memberships', {
      method: 'POST',
      body: JSON.stringify({ member_id: v('link-member').value, plan_id: v('link-plan').value, starts_at: v('link-start').value || undefined })
    });
    v('link-start').value = '';
    closeModal();
    await load();
  } catch (error) {
    v('link-status').textContent = `Erro ao salvar: ${error.message}`;
  } finally {
    v('save-link-button').disabled = false;
  }
}

async function cancelLink(item) {
  if (!confirm(`Cancelar matrícula de ${item.member_name}?`)) return;
  await call('/api/memberships/cancel', { method: 'POST', body: JSON.stringify({ membership_id: item.id }) });
  await load();
}

v('new-link-button').onclick = openModal;
v('close-link-modal').onclick = closeModal;
v('cancel-link-button').onclick = closeModal;
v('link-form').addEventListener('submit', (event) => { event.preventDefault(); save(); });
v('link-search').oninput = render;
load();
