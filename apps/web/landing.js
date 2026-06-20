const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const $ = (id) => document.getElementById(id);
let plans = [];

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function benefits(plan) {
  const text = plan.benefits || 'Acesso à academia\nAcompanhamento de treino\nÁrea do aluno';
  return text.split('\n').map((x) => x.trim()).filter(Boolean);
}

function renderPlans() {
  const box = $('landing-plans');
  box.innerHTML = '';
  if (!plans.length) {
    box.innerHTML = '<article class="plan-card"><strong>Nenhum plano disponível</strong><p>Entre em contato com a academia para consultar as opções.</p></article>';
    return;
  }
  for (const plan of plans.slice(0, 6)) {
    const card = document.createElement('article');
    card.className = 'plan-card';
    card.innerHTML = `<strong>${plan.name}</strong><p>${plan.public_highlight || 'Plano para começar hoje'}</p><div class="plan-price">${money(plan.price_cents)}</div><p>${plan.duration_days} dias de acesso</p>`;
    const btn = document.createElement('button');
    btn.className = 'cta secondary';
    btn.textContent = 'Ver plano';
    btn.onclick = () => openPlan(plan);
    card.appendChild(btn);
    box.appendChild(card);
  }
}

function openPlan(plan) {
  $('modal-plan-name').textContent = plan.name;
  $('modal-plan-price').textContent = `${money(plan.price_cents)} / ${plan.duration_days} dias`;
  $('modal-plan-desc').textContent = plan.description || 'Plano disponível para pré-matrícula online.';
  const list = $('modal-plan-benefits');
  list.innerHTML = '';
  for (const item of benefits(plan)) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  $('plan-modal').classList.remove('hidden');
}

async function loadPlans() {
  try {
    const response = await fetch(`${API}/api/public/plans`);
    const data = await response.json();
    plans = data.data || [];
    renderPlans();
  } catch (error) {
    $('landing-plans').innerHTML = '<article class="plan-card"><strong>Planos indisponíveis</strong><p>Não foi possível carregar os planos agora.</p></article>';
  }
}

$('close-plan-modal').onclick = () => $('plan-modal').classList.add('hidden');
loadPlans();
