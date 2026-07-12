const host = window.location.hostname || 'localhost';
function resolveApiBase() {
  const fallback = `${window.location.protocol}//${host}:3004`;
  try {
    const stored = localStorage.getItem('apiBaseUrl') || '';
    return stored && new URL(stored).hostname === host ? stored.replace(/\/$/, '') : fallback;
  } catch (_) {
    return fallback;
  }
}
const API = resolveApiBase();
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
let selectedPlanId = params.get('plan') || '';
let plans = [];

const samples = [
  { id: 'sample-essential', name: 'Essencial', price_cents: 8990, duration_days: 30, description: 'Rotina simples e consistente.', benefits: ['Musculação', 'Treino organizado', 'Acompanhamento da equipe'] },
  { id: 'sample-performance', name: 'Performance', price_cents: 12990, duration_days: 30, description: 'Mais acompanhamento para evoluir.', benefits: ['Musculação', 'Avaliação periódica', 'Revisão de treino'], featured: true },
  { id: 'sample-premium', name: 'Premium', price_cents: 17990, duration_days: 30, description: 'Experiência completa.', benefits: ['Todos os benefícios', 'Aulas incluídas', 'Atendimento prioritário'] }
];

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function listBenefits(plan) {
  if (Array.isArray(plan.benefits)) return plan.benefits;
  const text = String(plan.benefits || '').replace(/<[^>]+>/g, '\n');
  return text.split(/[\n;]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

async function getJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function selectedPlan() {
  return plans.find((plan) => String(plan.id) === String(selectedPlanId)) || samples.find((plan) => plan.id === selectedPlanId) || plans[0] || samples[0];
}

function renderSelectedPlan() {
  const plan = selectedPlan();
  $('enrollment-plan-id').value = plan?.id || '';
  $('selected-plan-summary').innerHTML = `<strong>${escapeHtml(plan?.name || 'Plano selecionado')}</strong><span>${money(plan?.price_cents)} / ${Number(plan?.duration_days || 30)} dias</span>`;
}

function renderPlans() {
  const box = $('public-plan-cards');
  box.innerHTML = plans.map((plan, index) => `
    <article class="plan-card ${plan.featured || index === 1 ? 'recommended' : ''}">
      <span class="plan-label">${plan.featured || index === 1 ? 'Mais escolhido' : 'Plano mensal'}</span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p>${escapeHtml(plan.description || 'Plano para sua rotina de treinos.')}</p>
      <div class="plan-price">${money(plan.price_cents)}</div>
      <ul>${listBenefits(plan).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <button class="cta ${plan.featured || index === 1 ? '' : 'ghost'}" type="button" data-plan-id="${escapeHtml(plan.id)}">Escolher este plano</button>
    </article>`).join('');
  box.querySelectorAll('[data-plan-id]').forEach((button) => button.addEventListener('click', () => openEnrollment(button.dataset.planId)));
}

function openEnrollment(planId) {
  selectedPlanId = planId || selectedPlanId || plans[0]?.id || samples[0].id;
  renderSelectedPlan();
  $('enrollment-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('enrollment-name').focus(), 60);
}

function closeEnrollment() {
  $('enrollment-modal').classList.add('hidden');
  document.body.style.overflow = '';
  $('enrollment-message').textContent = '';
}

function showMessage(text) {
  $('enrollment-message').textContent = text;
}

function updatePaymentHelp() {
  const help = {
    pix: 'A equipe enviará as instruções do Pix após receber sua pré-matrícula.',
    card: 'A equipe enviará um link seguro para pagamento com cartão.',
    boleto: 'A equipe enviará o boleto e o prazo para pagamento.',
    presencial: 'A equipe reservará seu plano para pagamento na recepção.'
  };
  $('payment-method-help').textContent = help[$('enrollment-payment-method').value] || help.pix;
}

async function submitEnrollment(event) {
  event.preventDefault();
  const password = $('enrollment-password').value;
  if (password !== $('enrollment-password-confirmation').value) return showMessage('As senhas precisam ser iguais.');
  if (!$('enrollment-terms').checked) return showMessage('Aceite o contato da academia para continuar.');
  if (!$('enrollment-plan-id').value) return showMessage('Escolha um plano antes de continuar.');

  const button = $('submit-enrollment');
  button.disabled = true;
  button.textContent = 'Enviando...';
  showMessage('Registrando sua pré-matrícula...');
  try {
    const result = await getJson('/api/public/enrollments', {
      method: 'POST',
      body: JSON.stringify({
        name: $('enrollment-name').value.trim(),
        email: $('enrollment-email').value.trim(),
        phone: $('enrollment-phone').value.trim(),
        plan_id: $('enrollment-plan-id').value,
        payment_method: $('enrollment-payment-method').value,
        password,
        password_confirmation: $('enrollment-password-confirmation').value
      })
    });
    $('enrollment-form').classList.add('hidden');
    $('enrollment-success').classList.remove('hidden');
    $('enrollment-success-text').textContent = result.email_delivery === 'sent'
      ? 'Enviamos um link para confirmar seu e-mail. Depois, aguarde a confirmação do pagamento para sua conta ser liberada.'
      : 'Seu pedido foi recebido. A confirmação de e-mail será encaminhada pela academia e a conta só será liberada após o pagamento.';
  } catch (error) {
    const labels = {
      email_ja_cadastrado: 'Este e-mail já possui uma conta ou uma matrícula em andamento.',
      email_invalido: 'Informe um e-mail válido.',
      senha_muito_curta: 'A senha precisa ter pelo menos 10 caracteres.',
      senha_fraca: 'Use letras maiúsculas, minúsculas e números na senha.',
      senhas_nao_conferem: 'As senhas precisam ser iguais.'
    };
    showMessage(labels[error.message] || 'Não foi possível enviar agora. Revise os dados e tente novamente.');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar pré-matrícula';
  }
}

async function loadPlans() {
  try {
    const result = await getJson('/api/public/plans');
    plans = (result.data || []).filter((plan) => Number(plan.price_cents || 0) > 0);
  } catch (_) {
    plans = [];
  }
  if (!plans.length) plans = samples;
  renderPlans();
  if (selectedPlanId) openEnrollment(selectedPlanId);
}

$('enrollment-form').addEventListener('submit', submitEnrollment);
$('enrollment-payment-method').addEventListener('change', updatePaymentHelp);
$('close-enrollment').addEventListener('click', closeEnrollment);
$('cancel-enrollment').addEventListener('click', closeEnrollment);
$('enrollment-modal').addEventListener('click', (event) => { if (event.target === $('enrollment-modal')) closeEnrollment(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('enrollment-modal').classList.contains('hidden')) closeEnrollment(); });
$('enrollment-phone').addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
  event.target.value = digits.length > 10 ? digits.replace(/^(\d{2})(\d)(\d{0,5})(\d{0,4})/, '($1) $2 $3-$4').replace(/-$/, '') : digits.replace(/^(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2 $3').replace(/\s+$/, '');
});

loadPlans();
