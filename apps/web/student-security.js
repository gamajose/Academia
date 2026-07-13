(function () {
  const p = (id) => document.getElementById(id);
  StudentPortal.init().catch((error) => { p('student-security-status').textContent = `Erro: ${error.message}`; });
  p('student-security-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = p('student-security-button'); const status = p('student-security-status'); const current = p('current-password').value; const next = p('new-password').value; const confirmation = p('password-confirmation').value;
    if (next !== confirmation) { status.textContent = 'As novas senhas não conferem.'; return; }
    try { button.disabled = true; button.textContent = 'Salvando...'; await StudentPortal.api('/api/student/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next, password_confirmation: confirmation }) }); localStorage.setItem('studentMustChangePassword', 'false'); p('student-security-form').reset(); status.textContent = 'Senha atualizada com sucesso.'; } catch (error) { const messages = { senha_atual_invalida: 'A senha atual não confere.', senha_muito_curta: 'Use 8 caracteres, 1 letra maiúscula e 1 número.', senhas_nao_conferem: 'As novas senhas não conferem.' }; status.textContent = messages[error.message] || `Erro: ${error.message}`; } finally { button.disabled = false; button.textContent = 'Atualizar senha'; }
  });
}());
