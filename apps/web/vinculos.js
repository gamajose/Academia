const VH = window.location.hostname || 'localhost';
const VAPI = localStorage.getItem('apiBaseUrl') || `http://${VH}:3004`;
const VTOKEN = localStorage.getItem('academiaToken') || '';
const v = (id) => document.getElementById(id);
let links = [];
let members = [];
let plans = [];
let editingLinkId = '';
let linkFilterPlaceholder = null;

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

function dateOnly(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10).split('-').map(Number);
  return raw.length === 3 && raw.every(Number.isFinite) ? new Date(raw[0], raw[1] - 1, raw[2]).toLocaleDateString('pt-BR') : String(value);
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function memberNameTone(item) {
  const declared = String(item.gender || item.sex || '').toLowerCase();
  if (['f', 'female', 'feminino', 'mulher'].includes(declared)) return 'female';
  if (['m', 'male', 'masculino', 'homem'].includes(declared)) return 'male';
  const firstName = String(item.member_name || '').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const femaleNames = new Set(['ana', 'amanda', 'aline', 'beatriz', 'camila', 'carolina', 'fernanda', 'gabriela', 'isabela', 'juliana', 'laura', 'mariana', 'marina', 'patricia', 'rafaela', 'sabrina', 'sofia', 'valentina']);
  const maleNames = new Set(['bruno', 'carlos', 'daniel', 'davi', 'eduardo', 'felipe', 'gabriel', 'joao', 'jose', 'lucas', 'marcos', 'matheus', 'miguel', 'pedro', 'rafael', 'rodrigo', 'thiago', 'vinicius']);
  return femaleNames.has(firstName) ? 'female' : maleNames.has(firstName) ? 'male' : 'neutral';
}

function membershipStatus(item) {
  if (item.status === 'cancelled') return 'cancelled';
  return item.ends_at && String(item.ends_at).slice(0, 10) < new Date().toISOString().slice(0, 10) ? 'expired' : 'active';
}

function membershipStatusLabel(status) {
  return ({ active: 'Ativa', expired: 'Vencida', cancelled: 'Cancelada' })[status] || status;
}

function render() {
  const list = v('link-list');
  const term = (v('link-search').value || '').toLowerCase().trim();
  const plan = v('link-filter-plan').value;
  const status = v('link-filter-status').value;
  const from = v('link-filter-from').value;
  const to = v('link-filter-to').value;
  list.innerHTML = '';
  const data = links.filter((item) => {
    const currentStatus = membershipStatus(item);
    const startsAt = String(item.starts_at || '').slice(0, 10);
    const endsAt = String(item.ends_at || '').slice(0, 10);
    return (!term || `${item.member_name || ''} ${item.plan_name || ''}`.toLowerCase().includes(term))
      && (!plan || item.plan_id === plan)
      && (!status || currentStatus === status)
      && (!from || startsAt >= from)
      && (!to || endsAt <= to);
  });
  for (const item of data) {
    const status = membershipStatus(item);
    const tr = document.createElement('tr');
    tr.className = 'membership-row-action';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.title = 'Abrir edição da matrícula';
    tr.innerHTML = `<td><span class="membership-member-name ${memberNameTone(item)}">${item.member_name || '-'}</span></td><td>${item.plan_name || '-'}</td><td>${money(item.plan_price_cents)}</td><td><span class="membership-status ${status}">${membershipStatusLabel(status)}</span></td><td class="membership-date">${dateOnly(item.starts_at)}</td><td class="membership-date">${dateOnly(item.ends_at)}</td><td></td>`;
    tr.addEventListener('click', () => openModal(item));
    tr.addEventListener('keydown', (event) => { if (event.target.closest('button')) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openModal(item); } });
    const actions = tr.lastElementChild;
    actions.appendChild(mini('✎', (event) => { event.stopPropagation(); openModal(item); }));
    actions.lastElementChild.className = 'icon-button';
    actions.lastElementChild.title = 'Editar matrícula';
    actions.lastElementChild.setAttribute('aria-label', 'Editar matrícula');
    actions.appendChild(mini(status === 'active' ? '⊘' : '●', (event) => { event.stopPropagation(); if (status === 'active') return cancelLink(item); }, status !== 'active'));
    actions.lastElementChild.className = 'icon-button';
    actions.lastElementChild.title = status === 'active' ? 'Cancelar matrícula' : 'Matrícula encerrada';
    actions.lastElementChild.setAttribute('aria-label', actions.lastElementChild.title);
    list.appendChild(tr);
  }
  if (!list.children.length) list.innerHTML = '<tr><td colspan="7">Nenhuma matrícula corresponde aos filtros.</td></tr>';
  v('link-filter-count').textContent = `${data.length} de ${links.length} matrícula(s)`;
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
    const planFilter = v('link-filter-plan');
    planFilter.innerHTML = '<option value="">Todos os planos</option>';
    for (const plan of planResult.data || []) { const option = document.createElement('option'); option.value = plan.id; option.textContent = plan.name; planFilter.appendChild(option); }
    render();
    v('link-status').textContent = '';
  } catch (error) {
    if (v('link-status')) v('link-status').textContent = `Erro: ${error.message}`;
  }
}

function openModal(item = {}) {
  editingLinkId = item.id || '';
  v('link-modal-title').textContent = editingLinkId ? 'Editar matrícula' : 'Nova matrícula';
  v('link-member').value = item.member_id || '';
  v('link-member').disabled = Boolean(editingLinkId);
  v('link-plan').value = item.plan_id || '';
  v('link-start').value = String(item.starts_at || '').slice(0, 10);
  v('save-link-button').textContent = editingLinkId ? 'Salvar alterações' : 'Salvar matrícula';
  v('link-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => v('link-member').focus(), 50);
}

function closeModal() {
  v('link-modal').classList.add('hidden');
  document.body.style.overflow = '';
  v('link-form').reset();
  editingLinkId = '';
  v('link-member').disabled = false;
  v('link-modal-title').textContent = 'Nova matrícula';
  v('save-link-button').textContent = 'Salvar matrícula';
}

async function save() {
  if (!v('link-form').reportValidity()) return;
  try {
    v('save-link-button').disabled = true;
    await call(editingLinkId ? '/api/memberships/update' : '/api/memberships', {
      method: 'POST',
      body: JSON.stringify(editingLinkId
        ? { membership_id: editingLinkId, plan_id: v('link-plan').value, starts_at: v('link-start').value || undefined }
        : { member_id: v('link-member').value, plan_id: v('link-plan').value, starts_at: v('link-start').value || undefined })
    });
    v('link-start').value = '';
    closeModal();
    await load();
  } catch (error) {
    if (v('link-status')) v('link-status').textContent = `Erro ao salvar: ${error.message}`;
  } finally {
    v('save-link-button').disabled = false;
  }
}

async function cancelLink(item) {
  if (!confirm(`Cancelar matrícula de ${item.member_name}?`)) return;
  await call('/api/memberships/cancel', { method: 'POST', body: JSON.stringify({ membership_id: item.id }) });
  await load();
}

function openLinkFilters() {
  const panel = document.querySelector('.membership-filter-panel');
  const body = v('link-filter-modal-body');
  const modal = v('link-filter-modal');
  if (!panel || !body || !modal) return;
  linkFilterPlaceholder = document.createComment('link-filter-placeholder');
  panel.parentElement.insertBefore(linkFilterPlaceholder, panel);
  body.appendChild(panel);
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => v('link-search')?.focus(), 40);
}

function closeLinkFilters() {
  const panel = document.querySelector('#link-filter-modal .membership-filter-panel');
  if (panel && linkFilterPlaceholder?.parentElement) {
    linkFilterPlaceholder.parentElement.insertBefore(panel, linkFilterPlaceholder.nextSibling);
  }
  linkFilterPlaceholder?.remove();
  linkFilterPlaceholder = null;
  v('link-filter-modal')?.classList.add('hidden');
  if (v('link-modal')?.classList.contains('hidden')) document.body.classList.remove('modal-open');
}

v('new-link-button').onclick = openModal;
v('link-filter-toggle').onclick = openLinkFilters;
v('close-link-filter-modal').onclick = closeLinkFilters;
v('link-filter-modal').onclick = (event) => { if (event.target === v('link-filter-modal')) closeLinkFilters(); };
v('close-link-modal').onclick = closeModal;
v('cancel-link-button').onclick = closeModal;
v('link-form').addEventListener('submit', (event) => { event.preventDefault(); save(); });
v('link-search').oninput = render;
['link-filter-plan', 'link-filter-status', 'link-filter-from', 'link-filter-to'].forEach((id) => v(id).addEventListener('change', render));
v('link-clear-filters').onclick = () => { ['link-search', 'link-filter-plan', 'link-filter-status', 'link-filter-from', 'link-filter-to'].forEach((id) => { v(id).value = ''; }); render(); };
load();
