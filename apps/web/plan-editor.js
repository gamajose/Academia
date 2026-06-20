const PHOST = window.location.hostname || 'localhost';
const PAPI = localStorage.getItem('apiBaseUrl') || `http://${PHOST}:3004`;
const PTOKEN = localStorage.getItem('academiaToken') || '';
const p = (id) => document.getElementById(id);
let planRows = [];

async function requestPlan(path, options = {}) {
  const response = await fetch(`${PAPI}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PTOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mini(text, fn) {
  const button = document.createElement('button');
  button.className = 'mini-button';
  button.textContent = text;
  button.onclick = fn;
  return button;
}

function renderPlans() {
  const list = p('plans-page-list');
  list.innerHTML = '';
  for (const plan of planRows) {
    const item = document.createElement('li');
    item.append(`${plan.name} | ${brl(plan.price_cents)} | ${plan.duration_days} dias | ${plan.is_active ? 'ativo' : 'inativo'} | ${plan.public_highlight || 'sem destaque'} `);
    item.appendChild(mini('Editar', () => openPlan(plan)));
    item.appendChild(mini(plan.is_active ? 'Desativar' : 'Ativar', () => togglePlan(plan)));
    list.appendChild(item);
  }
  if (!list.children.length) {
    const item = document.createElement('li');
    item.textContent = 'Nenhum plano encontrado.';
    list.appendChild(item);
  }
}

async function loadPlans() {
  try {
    const result = await requestPlan('/api/plans/detail');
    planRows = result.data || [];
    renderPlans();
    p('plans-status').textContent = 'Planos carregados.';
  } catch (error) {
    p('plans-status').textContent = `Erro: ${error.message}`;
  }
}

function openPlan(plan = {}) {
  p('plan-modal').classList.remove('hidden');
  p('plan-id').value = plan.id || '';
  p('plan-name-page').value = plan.name || '';
  p('plan-price-page').value = plan.price_cents || '';
  p('plan-days-page').value = plan.duration_days || 30;
  p('plan-highlight-page').value = plan.public_highlight || '';
  p('plan-description-page').value = plan.description || '';
  p('plan-benefits-page').value = plan.benefits || '';
  p('plan-rules-page').value = plan.rules || '';
}

function closePlan() {
  p('plan-modal').classList.add('hidden');
}

async function savePlan() {
  try {
    const id = p('plan-id').value;
    const payload = {
      name: p('plan-name-page').value.trim(),
      price_cents: Number(p('plan-price-page').value || 0),
      duration_days: Number(p('plan-days-page').value || 30),
      public_highlight: p('plan-highlight-page').value.trim(),
      description: p('plan-description-page').value.trim(),
      benefits: p('plan-benefits-page').value.trim(),
      rules: p('plan-rules-page').value.trim()
    };
    await requestPlan(id ? '/api/plans/update' : '/api/plans', { method: 'POST', body: JSON.stringify(id ? { plan_id: id, ...payload } : payload) });
    closePlan();
    await loadPlans();
  } catch (error) {
    p('plans-status').textContent = `Erro ao salvar: ${error.message}`;
  }
}

async function togglePlan(plan) {
  await requestPlan(plan.is_active ? '/api/plans/deactivate' : '/api/plans/activate', { method: 'POST', body: JSON.stringify({ plan_id: plan.id }) });
  await loadPlans();
}

p('new-plan-button').onclick = () => openPlan();
p('close-plan-modal').onclick = closePlan;
p('save-plan-page-button').onclick = savePlan;
loadPlans();
