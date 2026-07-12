const SECURITY_HOST = window.location.hostname || 'localhost';
const SECURITY_API = localStorage.getItem('apiBaseUrl') || `http://${SECURITY_HOST}:3004`;
const SECURITY_TOKEN = localStorage.getItem('academiaToken') || '';
const securityField = (id) => document.getElementById(id);

document.getElementById('security-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = securityField('security-status');
  const current = securityField('current-password').value;
  const next = securityField('new-password').value;
  if (next !== securityField('confirm-password').value) { status.textContent = 'As novas senhas não conferem.'; return; }
  try {
    const response = await fetch(`${SECURITY_API}/api/me/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECURITY_TOKEN}` },
      body: JSON.stringify({ current_password: current, new_password: next })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    securityField('security-form').reset();
    status.textContent = 'Senha atualizada com sucesso.';
  } catch (error) {
    const messages = { senha_atual_invalida: 'A senha atual não confere.', senha_muito_curta: 'A nova senha é muito curta.', senha_fraca: 'Use maiúscula, minúscula e número.' };
    status.textContent = messages[error.message] || `Erro: ${error.message}`;
  }
});
