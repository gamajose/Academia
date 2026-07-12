const defaultHost = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${defaultHost}:3004`;
const emailField = document.getElementById('student-email');
const passwordField = document.getElementById('student-password');
const loginButton = document.getElementById('student-login-button');

function msg(text) {
  document.getElementById('student-login-message').textContent = text;
}

function portalOn() {
  const token = localStorage.getItem('academiaToken') || '';
  if (token) document.cookie = `academiaAuth=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

function studentPortalOn() {
  const token = localStorage.getItem('studentToken') || '';
  if (token) document.cookie = `academiaStudentAuth=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
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
  const email = emailField.value.trim();
  const password = passwordField.value;
  if (!email || !password) {
    msg('Informe e-mail e senha.');
    (email ? passwordField : emailField).focus();
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = 'Entrando...';
  msg('Validando acesso...');
  const payload = { email, password };

  try {
    const admin = await post('/api/auth/login', payload);
    localStorage.setItem('academiaToken', admin.token);
    localStorage.setItem('apiBaseUrl', API);
    localStorage.setItem('academiaUserName', admin.user?.name || 'Minha conta');
    localStorage.setItem('academiaRole', admin.user?.role || 'admin');
    portalOn();
    window.location.href = './painel.html';
    return;
  } catch (_) {
    // O mesmo formulário atende aluno e equipe; tenta o perfil de aluno em seguida.
  }

  try {
    const student = await post('/api/student/auth/login', payload);
    localStorage.setItem('studentToken', student.token);
    localStorage.setItem('studentName', student.student?.name || 'Aluno');
    localStorage.setItem('studentApiBaseUrl', API);
    studentPortalOn();
    window.location.href = './student-portal.html';
  } catch (error) {
    const map = { credenciais_invalidas: 'E-mail ou senha inválidos.', dados_invalidos: 'Informe e-mail e senha.' };
    msg(map[error.message] || 'Não foi possível acessar sua conta. Confira os dados e tente novamente.');
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
}

function forgotPassword() {
  msg('Procure a recepção para redefinir sua senha com segurança.');
}

loginButton.addEventListener('click', accountLogin);
document.getElementById('forgot-password-button').addEventListener('click', forgotPassword);
[emailField, passwordField].forEach((field) => field.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') accountLogin();
}));
