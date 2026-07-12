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
let enrollmentId = '';
let pollTimer = null;
let plans = [];

const samples = [
  { id: 'sample-essential', name: 'Essencial', price_cents: 8990, duration_days: 30, description: 'Rotina simples e consistente.', benefits: ['Musculação', 'Treino organizado', 'Acompanhamento da equipe'] },
  { id: 'sample-performance', name: 'Performance', price_cents: 12990, duration_days: 30, description: 'Mais acompanhamento para evoluir.', benefits: ['Musculação', 'Avaliação periódica', 'Revisão de treino'], featured: true },
  { id: 'sample-premium', name: 'Premium', price_cents: 17990, duration_days: 30, description: 'Experiência completa.', benefits: ['Todos os benefícios', 'Aulas incluídas', 'Atendimento prioritário'] }
];

function money(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }
function listBenefits(plan) {
  if (Array.isArray(plan.benefits)) return plan.benefits;
  return String(plan.benefits || '').replace(/<[^>]+>/g, '\n').split(/[\n;]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

async function getJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function selectedPlan() { return plans.find((plan) => String(plan.id) === String(selectedPlanId)) || samples.find((plan) => plan.id === selectedPlanId) || plans[0] || samples[0]; }
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
      <h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description || 'Plano para sua rotina de treinos.')}</p>
      <div class="plan-price">${money(plan.price_cents)}</div><ul>${listBenefits(plan).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
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
function stopPolling() { if (pollTimer) window.clearInterval(pollTimer); pollTimer = null; }
function closeEnrollment() {
  stopPolling();
  $('enrollment-modal').classList.add('hidden');
  document.body.style.overflow = '';
  $('enrollment-message').textContent = '';
}
function showMessage(text) { $('enrollment-message').textContent = text; }
function updatePaymentHelp() {
  $('payment-method-help').textContent = $('enrollment-payment-method').value === 'pix'
    ? 'Copie o código Pix ou escaneie o QR Code. A confirmação acontece automaticamente.'
    : 'Você será levado ao checkout seguro do PayPal. É possível pagar com cartão, mesmo sem conta PayPal.';
}
function showPayment(result) {
  enrollmentId = result.id;
  $('enrollment-form').classList.add('hidden');
  $('payment-step').classList.remove('hidden');
  $('pix-payment-panel').classList.toggle('hidden', result.payment_method !== 'pix');
  $('paypal-payment-panel').classList.toggle('hidden', result.payment_method !== 'paypal');
  const payment = result.payment || {};
  $('payment-status').textContent = result.payment_method === 'pix' ? 'Aguardando a confirmação do Pix.' : 'Finalize o pagamento no PayPal para continuar.';
  if (result.payment_method === 'pix') {
    $('pix-code').textContent = payment.qr_code || 'O código Pix será exibido quando o provedor responder.';
    $('pix-qr').src = payment.qr_code_base64 ? `data:image/png;base64,${payment.qr_code_base64}` : '';
    $('pix-qr').classList.toggle('hidden', !payment.qr_code_base64);
    startPolling();
  } else {
    $('paypal-link').href = payment.approval_url || '#';
    $('paypal-link').classList.toggle('disabled-link', !payment.approval_url);
  }
}
function showPaid(emailDelivery) {
  stopPolling();
  $('payment-status').textContent = 'Pagamento confirmado.';
  $('payment-email-status').textContent = emailDelivery === 'sent'
    ? 'Enviamos o link para confirmar seu cadastro no seu e-mail.'
    : 'O pagamento foi confirmado. O e-mail de confirmação será enviado assim que o serviço de e-mail estiver disponível.';
  $('payment-confirmed').classList.remove('hidden');
  $('pix-payment-panel').classList.add('hidden');
  $('paypal-payment-panel').classList.add('hidden');
}
async function checkPaymentStatus() {
  if (!enrollmentId) return;
  const result = await getJson(`/api/public/enrollments/status?enrollment_id=${encodeURIComponent(enrollmentId)}`);
  if (result.payment_status === 'paid') showPaid(result.email_delivery);
}
function startPolling() {
  stopPolling();
  pollTimer = window.setInterval(() => checkPaymentStatus().catch(() => {}), 5000);
}
async function submitEnrollment(event) {
  event.preventDefault();
  const password = $('enrollment-password').value;
  if (password !== $('enrollment-password-confirmation').value) return showMessage('As senhas precisam ser iguais.');
  if (!$('enrollment-terms').checked) return showMessage('Aceite os termos para continuar.');
  if (!$('enrollment-plan-id').value) return showMessage('Escolha um plano antes de continuar.');
  const button = $('submit-enrollment');
  button.disabled = true; button.textContent = 'Abrindo pagamento...'; showMessage('Criando seu pagamento seguro...');
  try {
    const result = await getJson('/api/public/enrollments', {
      method: 'POST',
      body: JSON.stringify({ name: $('enrollment-name').value.trim(), email: $('enrollment-email').value.trim(), phone: $('enrollment-phone').value.trim(), plan_id: $('enrollment-plan-id').value, payment_method: $('enrollment-payment-method').value, password, password_confirmation: $('enrollment-password-confirmation').value })
    });
    showPayment(result);
  } catch (error) {
    const labels = {
      email_ja_cadastrado: 'Este e-mail já possui uma conta.',
      matricula_em_andamento: 'Já existe um pagamento em andamento para este e-mail.',
      pagamento_nao_configurado: 'Este método de pagamento ainda não está configurado pela academia.',
      email_invalido: 'Informe um e-mail válido.',
      metodo_pagamento_invalido: 'Escolha Pix ou PayPal.',
      senha_muito_curta: 'A senha precisa ter pelo menos 10 caracteres.',
      senha_fraca: 'Use letras maiúsculas, minúsculas e números na senha.',
      senhas_nao_conferem: 'As senhas precisam ser iguais.'
    };
    showMessage(labels[error.message] || 'Não foi possível abrir o pagamento. Tente novamente.');
  } finally { button.disabled = false; button.textContent = 'Ir para o pagamento'; }
}
async function loadPlans() {
  try { const result = await getJson('/api/public/plans'); plans = (result.data || []).filter((plan) => Number(plan.price_cents || 0) > 0); } catch (_) { plans = []; }
  if (!plans.length) plans = samples;
  renderPlans();
  if (selectedPlanId) openEnrollment(selectedPlanId);
}

$('enrollment-form').addEventListener('submit', submitEnrollment);
$('enrollment-payment-method').addEventListener('change', updatePaymentHelp);
$('close-enrollment').addEventListener('click', closeEnrollment);
$('cancel-enrollment').addEventListener('click', closeEnrollment);
$('copy-pix').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('pix-code').textContent); $('copy-pix').textContent = 'Código copiado'; setTimeout(() => { $('copy-pix').textContent = 'Copiar código Pix'; }, 1800); } catch (_) { showMessage('Selecione e copie o código Pix manualmente.'); }
});
$('enrollment-modal').addEventListener('click', (event) => { if (event.target === $('enrollment-modal')) closeEnrollment(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('enrollment-modal').classList.contains('hidden')) closeEnrollment(); });
$('enrollment-phone').addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
  event.target.value = digits.length > 10 ? digits.replace(/^(\d{2})(\d)(\d{0,5})(\d{0,4})/, '($1) $2 $3-$4').replace(/-$/, '') : digits.replace(/^(\d{2})(\d{0,4})(\d{0,4})/, '($1) $2 $3').replace(/\s+$/, '');
});
updatePaymentHelp();
loadPlans();
