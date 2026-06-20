const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const $ = (id) => document.getElementById(id);
let plans = [];

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    $('public-status').textContent = plans.length ? 'Escolha um plano e preencha seus dados.' : 'Nenhum plano público disponível no momento.';
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

$('public-submit').addEventListener('click', submitPublicEnrollment);
loadPublicPlans();
