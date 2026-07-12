const resetHost = window.location.hostname || 'localhost';
const resetApi = (() => {
  const fallback = `${window.location.protocol}//${resetHost}:3004`;
  try {
    const stored = localStorage.getItem('apiBaseUrl') || '';
    return stored && new URL(stored).hostname === resetHost ? stored.replace(/\/$/, '') : fallback;
  } catch (_) {
    return fallback;
  }
})();
const resetToken = new URLSearchParams(window.location.search).get('token') || '';
const resetForm = document.getElementById('reset-form');
const resetMessage = document.getElementById('reset-message');

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('reset-password').value;
  const confirmation = document.getElementById('reset-password-confirmation').value;
  if (!resetToken) { resetMessage.textContent = 'Este link de recuperação não é válido.'; return; }
  if (password !== confirmation) { resetMessage.textContent = 'As senhas precisam ser iguais.'; return; }
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) { resetMessage.textContent = 'Use pelo menos 10 caracteres, com maiúscula, minúscula e número.'; return; }
  const button = resetForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Salvando...';
  try {
    const response = await fetch(`${resetApi}/api/student/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, new_password: password }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    resetMessage.textContent = 'Senha alterada. Você já pode acessar sua conta.';
    button.remove();
    setTimeout(() => { window.location.href = './student-login.html'; }, 1200);
  } catch (error) {
    resetMessage.textContent = error.message === 'token_invalido_ou_expirado' ? 'Este link expirou. Solicite uma nova recuperação.' : 'Não foi possível alterar a senha agora.';
    button.disabled = false;
    button.textContent = 'Salvar nova senha';
  }
});
