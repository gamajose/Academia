const defaultHost = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${defaultHost}:3004`;

function msg(text) {
  document.getElementById('student-login-message').textContent = text;
}

function portalOn() {
  document.cookie = 'academiaPortal=1; Path=/; SameSite=Lax';
}

async function post(path, payload) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_login');
  return data;
}

async function accountLogin() {
  const email = document.getElementById('student-email').value.trim();
  const password = document.getElementById('student-password').value;
  const payload = { email, password };
  msg('Validando acesso...');

  try {
    const admin = await post('/api/auth/login', payload);
    localStorage.setItem('academiaToken', admin.token);
    localStorage.setItem('apiBaseUrl', API);
    portalOn();
    window.location.href = './painel.html';
    return;
  } catch (_) {}

  try {
    const student = await post('/api/student/auth/login', payload);
    localStorage.setItem('studentToken', student.token);
    localStorage.setItem('studentName', student.student?.name || 'Aluno');
    localStorage.setItem('studentApiBaseUrl', API);
    window.location.href = './student-portal.html';
  } catch (error) {
    const map = { credenciais_invalidas: 'E-mail ou senha inválido.', dados_invalidos: 'Informe e-mail e senha.' };
    msg(map[error.message] || `Falha no acesso: ${error.message}`);
  }
}

function forgotPassword() {
  msg('Recuperação de senha em implantação. Procure a recepção da academia para redefinir o acesso.');
}

document.getElementById('student-login-button').addEventListener('click', accountLogin);
document.getElementById('forgot-password-button').addEventListener('click', forgotPassword);
