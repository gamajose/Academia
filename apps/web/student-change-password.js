const CHANGE_PASSWORD_API = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
const CHANGE_PASSWORD_TOKEN = localStorage.getItem('studentToken') || '';
const form = document.getElementById('change-password-form');
const button = document.getElementById('change-password-button');
const message = document.getElementById('change-password-message');

if (!CHANGE_PASSWORD_TOKEN) window.location.href = './student-login.html';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmation = document.getElementById('password-confirmation').value;
  if (newPassword !== confirmation) {
    message.textContent = 'As novas senhas não conferem.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Salvando...';
  message.textContent = '';
  try {
    const response = await fetch(`${CHANGE_PASSWORD_API}/api/student/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CHANGE_PASSWORD_TOKEN}` },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, password_confirmation: confirmation })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'nao_foi_possivel_atualizar');
    localStorage.setItem('studentMustChangePassword', 'false');
    window.location.href = './student-portal.html';
  } catch (error) {
    const errors = { senha_atual_invalida: 'A senha atual não confere.', senha_muito_curta: 'A nova senha precisa ter pelo menos 10 caracteres.', senhas_nao_conferem: 'As novas senhas não conferem.' };
    message.textContent = errors[error.message] || 'Não foi possível trocar a senha agora.';
    button.disabled = false;
    button.textContent = 'Salvar nova senha';
  }
});
