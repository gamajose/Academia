const defaultHost = window.location.hostname || 'localhost';
function resolveApiBase() {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin;
  }

  const fallback = `${window.location.protocol}//${defaultHost}:3004`;
  try {
    const stored = localStorage.getItem('apiBaseUrl') || '';
    return stored && new URL(stored).hostname === defaultHost ? stored.replace(/\/$/, '') : fallback;
  } catch (_) {
    return fallback;
  }
}
const API = resolveApiBase();
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
  const identifier = emailField.value.trim();
  const password = passwordField.value;
  if (!identifier || !password) {
    msg('Informe e-mail ou telefone e senha.');
    (identifier ? passwordField : emailField).focus();
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = 'Entrando...';
  msg('Validando acesso...');
  const payload = { identifier, password };

  let adminError;
  try {
    const admin = await post('/api/auth/login', payload);
    localStorage.setItem('academiaToken', admin.token);
    localStorage.setItem('apiBaseUrl', API);
    localStorage.setItem('academiaUserName', admin.user?.name || 'Meu perfil');
    localStorage.setItem('academiaRole', admin.user?.role || 'admin');
    localStorage.setItem('academiaAccessProfile', admin.user?.access_profile || 'admin');
    portalOn();
    window.location.href = './painel.html';
    return;
  } catch (error) {
    adminError = error;
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
    const map = {
      credenciais_invalidas: 'E-mail ou senha inválidos.',
      dados_invalidos: 'Informe e-mail e senha.',
      muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      api_indisponivel: 'Não foi possível conectar ao servidor. Tente novamente em instantes.'
    };
    const networkFailure = [adminError, error].some((item) => item?.message === 'Failed to fetch' || item?.message === 'api_indisponivel');
    msg(networkFailure ? 'Não foi possível conectar ao servidor. Verifique a conexão da academia e tente novamente.' : (map[error.message] || 'Não foi possível acessar sua conta. Confira os dados e tente novamente.'));
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
}

function forgotPassword() {
  document.getElementById('forgot-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('forgot-email').value = emailField.value.trim();
  document.getElementById('forgot-email').focus();
}

function closeForgot() {
  document.getElementById('forgot-modal').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('forgot-message').textContent = '';
}

async function submitForgot(event) {
  event.preventDefault();
  const identifier = document.getElementById('forgot-email').value.trim();
  const button = document.getElementById('submit-forgot');
  if (!identifier) {
    document.getElementById('forgot-message').textContent = 'Informe seu e-mail ou telefone.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const result = await post('/api/auth/forgot-password', { identifier });
    document.getElementById('forgot-message').textContent = result.message || 'Confira seu e-mail para continuar.';
  } catch (_) {
    document.getElementById('forgot-message').textContent = 'Não foi possível solicitar agora. Tente novamente em instantes.';
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar instruções';
  }
}

document.getElementById('password-toggle').addEventListener('click', () => {
  const visible = passwordField.type === 'text';
  passwordField.type = visible ? 'password' : 'text';
  const toggle = document.getElementById('password-toggle');
  toggle.textContent = visible ? 'Mostrar' : 'Ocultar';
  toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
});

document.getElementById('login-form').addEventListener('submit', (event) => { event.preventDefault(); accountLogin(); });
document.getElementById('forgot-password-button').addEventListener('click', forgotPassword);
document.getElementById('forgot-form').addEventListener('submit', submitForgot);
document.getElementById('close-forgot').addEventListener('click', closeForgot);
document.getElementById('cancel-forgot').addEventListener('click', closeForgot);
document.getElementById('forgot-modal').addEventListener('click', (event) => { if (event.target.id === 'forgot-modal') closeForgot(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !document.getElementById('forgot-modal').classList.contains('hidden')) closeForgot(); });
[emailField, passwordField].forEach((field) => field.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') accountLogin();
}));
