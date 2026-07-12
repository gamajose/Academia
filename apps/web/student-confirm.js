const confirmHost = window.location.hostname || 'localhost';
const confirmApi = (() => {
  const fallback = `${window.location.protocol}//${confirmHost}:3004`;
  try {
    const stored = localStorage.getItem('apiBaseUrl') || '';
    return stored && new URL(stored).hostname === confirmHost ? stored.replace(/\/$/, '') : fallback;
  } catch (_) {
    return fallback;
  }
})();
const confirmToken = new URLSearchParams(window.location.search).get('token') || '';
const title = document.getElementById('confirm-title');
const message = document.getElementById('confirm-message');
const loginLink = document.getElementById('confirm-login');

async function confirmEmail() {
  if (!confirmToken) throw new Error('token_invalido');
  const response = await fetch(`${confirmApi}/api/public/enrollments/confirm-email?token=${encodeURIComponent(confirmToken)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

confirmEmail().then(() => {
  title.textContent = 'E-mail confirmado.';
  message.textContent = 'Seu cadastro foi confirmado e sua conta já está pronta para acesso.';
  loginLink.classList.remove('hidden');
}).catch(() => {
  title.textContent = 'Não foi possível confirmar.';
  message.textContent = 'Esse link pode ter expirado ou já ter sido utilizado. Solicite uma nova pré-matrícula com a equipe.';
});
