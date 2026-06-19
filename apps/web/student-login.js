const defaultStudentHost = window.location.hostname || 'localhost';
const studentLoginApiInput = document.getElementById('student-api-url');
studentLoginApiInput.value = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${defaultStudentHost}:3004`;

function setStudentLoginMessage(text) {
  document.getElementById('student-login-message').textContent = text;
}

async function studentLogin() {
  const baseUrl = studentLoginApiInput.value.replace(/\/$/, '');
  const email = document.getElementById('student-email').value.trim();
  const password = document.getElementById('student-password').value;
  setStudentLoginMessage('Validando acesso...');

  try {
    const response = await fetch(`${baseUrl}/api/student/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_login');
    localStorage.setItem('studentApiBaseUrl', baseUrl);
    localStorage.setItem('studentToken', data.token);
    localStorage.setItem('studentName', data.student?.name || 'Aluno');
    window.location.href = './student-portal.html';
  } catch (error) {
    const map = { credenciais_invalidas: 'E-mail ou senha invalido.', dados_invalidos: 'Informe e-mail e senha.' };
    setStudentLoginMessage(map[error.message] || `Falha no acesso: ${error.message}`);
  }
}

document.getElementById('student-login-button').addEventListener('click', studentLogin);
