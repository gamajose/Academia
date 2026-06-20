const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const $ = (id) => document.getElementById(id);
let plans = [];
let selectedPlanId = new URLSearchParams(window.location.search).get('plan') || '';

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function benefits(plan) {
  const text = plan.benefits || 'Acesso à academia\nAcompanhamento de treino\nÁrea do aluno';
  return text.split('\n').map((x) => x.trim()).filter(Boolean);
}

async function getJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function choosePlan(id) {
  selectedPlanId = id;
  $('public-plan').value = id;
  document.querySelectorAll('.plan-card').forEach((card) => card.style.outline = 'none');
  const card = document.querySelector(`[data-plan-id="${id}"]`);
  if (card) card.style.outline = '3px solid #38bdf8';
  const plan = plans.find((p) => p.id === id);
  $('public-status').textContent = plan ? `Plano selecionado: ${plan.name} - ${money(plan.price_cents)}` : 'Plano selecionado.';
  document.getElementById('public-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderPlanCards() {
  const box = $('public-plan-cards');
  box.innerHTML = '';
  for (const plan of plans) {
    const card = document.createElement('article');
    card.className = 'plan-card';
    card.dataset.planId = plan.id;
    card.innerHTML = `<strong>${plan.name}</strong><p>${plan.public_highlight || 'Plano disponível'}</p><div class="plan-price">${money(plan.price_cents)}</div><p>${plan.duration_days} dias</p><ul class="benefit-list">${benefits(plan).slice(0, 4).map((x) => `<li>${x}</li>`).join('')}</ul>`;
    const btn = document.createElement('button');
    btn.className = 'cta secondary';
    btn.textContent = 'Escolher este plano';
    btn.onclick = () => choosePlan(plan.id);
    card.appendChild(btn);
    box.appendChild(card);
  }
  if (!plans.length) box.innerHTML = '<article class="plan-card"><strong>Nenhum plano disponível</strong><p>Entre em contato com a academia.</p></article>';
}

async function loadPublicPlans() {
  try {
    const result = await getJson('/api/public/plans');
    plans = result.data || [];
    const select = $('public-plan');
    select.innerHTML = '<option value="">Selecione o plano</option>';
    for (const plan of plans) {
      const option = document.createElement('option');
      option.value = plan.id;
      option.textContent = `${plan.name} - ${money(plan.price_cents)} / ${plan.duration_days} dias`;
      select.appendChild(option);
    }
    renderPlanCards();
    if (selectedPlanId) choosePlan(selectedPlanId);
    else $('public-status').textContent = plans.length ? 'Escolha um plano e preencha seus dados.' : 'Nenhum plano público disponível no momento.';
  } catch (error) {
    $('public-status').textContent = `API indisponível: ${error.message}`;
  }
}

async function submitPublicEnrollment() {
  try {
    const payload = {
      name: $('public-name').value.trim(),
      email: $('public-email').value.trim(),
      phone: $('public-phone').value.trim(),
      plan_id: $('public-plan').value,
      payment_method: 'pendente'
    };
    const result = await getJson('/api/public/enrollments', { method: 'POST', body: JSON.stringify(payload) });
    $('public-status').textContent = `Pré-matrícula enviada. Código: ${result.enrollment_code}. Aguarde a confirmação financeira para liberação.`;
  } catch (error) {
    $('public-status').textContent = `Erro na pré-matrícula: ${error.message}`;
  }
}

$('public-plan').addEventListener('change', (event) => choosePlan(event.target.value));
$('public-submit').addEventListener('click', submitPublicEnrollment);
loadPublicPlans();
