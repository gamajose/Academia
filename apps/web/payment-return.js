const returnHost = window.location.hostname || 'localhost';
const returnApi = (() => {
  const fallback = `${window.location.protocol}//${returnHost}:3004`;
  try { const stored = localStorage.getItem('apiBaseUrl') || ''; return stored && new URL(stored).hostname === returnHost ? stored.replace(/\/$/, '') : fallback; } catch (_) { return fallback; }
})();
const query = new URLSearchParams(window.location.search);
const enrollmentId = query.get('enrollment_id') || '';
const orderId = query.get('token') || '';
const title = document.getElementById('payment-return-title');
const message = document.getElementById('payment-return-message');
const login = document.getElementById('payment-return-login');

async function capture() {
  if (!enrollmentId || !orderId) throw new Error('pagamento_cancelado');
  const response = await fetch(`${returnApi}/api/public/payments/paypal/capture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollment_id: enrollmentId, order_id: orderId }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'pagamento_nao_confirmado');
  return data;
}

capture().then((data) => {
  title.textContent = 'Pagamento confirmado.';
  message.textContent = data.email_delivery === 'sent' ? 'Enviamos o e-mail para você confirmar seu cadastro.' : 'O pagamento foi recebido. O e-mail de confirmação será enviado em seguida.';
  login.classList.remove('hidden');
}).catch((error) => {
  title.textContent = error.message === 'pagamento_cancelado' ? 'Pagamento não concluído.' : 'Não foi possível confirmar agora.';
  message.textContent = error.message === 'pagamento_cancelado' ? 'Você pode voltar e escolher outro método de pagamento.' : 'Confira o status no PayPal e tente novamente. Se o valor foi debitado, aguarde alguns instantes antes de repetir.';
});
