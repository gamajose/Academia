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

function finishLogin(data) {
  if (data.account_type === 'admin') {
    localStorage.setItem('academiaToken', data.token);
    localStorage.setItem('apiBaseUrl', API);
    localStorage.setItem('academiaUserName', data.user?.name || 'Meu perfil');
    localStorage.setItem('academiaRole', data.user?.role || 'admin');
    localStorage.setItem('academiaAccessProfile', data.user?.access_profile || 'admin');
    portalOn();
    window.location.href = './painel.html';
    return;
  }
  localStorage.setItem('studentToken', data.token);
  localStorage.setItem('studentName', data.student?.name || 'Aluno');
  localStorage.setItem('studentAccountType', data.account_type || 'student');
  localStorage.setItem('studentApiBaseUrl', API);
  studentPortalOn();
  window.location.href = data.account_type === 'visitor' ? './visitor-portal.html' : './student-progress.html';
}

async function googleLogin(credential) {
  loginButton.disabled = true;
  msg('Validando sua conta Google...');
  try { finishLogin(await post('/api/auth/google', { id_token: credential })); }
  catch (error) { msg(error.message === 'google_nao_configurado' ? 'Login com Google ainda não foi configurado pela academia.' : 'Não foi possível entrar com o Google. Tente novamente.'); loginButton.disabled = false; }
}

function renderFallbackGoogleButton(container) {
  container.innerHTML = `
    <button type="button" class="google-custom-btn" id="student-google-fallback-btn" style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 16px; border: 1px solid var(--line, #cfe2f4); border-radius: 8px; background: #ffffff; color: #1e293b; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s ease;">
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
      <span>Continuar com o Google</span>
    </button>
  `;
  document.getElementById('student-google-fallback-btn')?.addEventListener('click', () => {
    msg('Login com Google: informe o Google Client ID em Configurações > Personalizar site ou faça login com e-mail e senha.');
  });
}

async function initGoogleLogin() {
  const container = document.getElementById('google-login-button');
  if (!container) return;
  try {
    const response = await fetch(`${API}/api/auth/google/config`);
    const config = await response.json();
    if (!config.enabled || !config.client_id) {
      renderFallbackGoogleButton(container);
      return;
    }
    for (let attempt = 0; attempt < 40 && !window.google?.accounts?.id; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    if (!window.google?.accounts?.id) throw new Error('google_script_unavailable');
    window.google.accounts.id.initialize({ client_id: config.client_id, callback: (response) => googleLogin(response.credential) });
    window.google.accounts.id.renderButton(container, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 360 });
  } catch (_) {
    renderFallbackGoogleButton(container);
  }
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
    finishLogin({ ...admin, account_type: 'admin' });
    return;
  } catch (error) {
    adminError = error;
    // O mesmo formulário atende aluno e equipe; tenta o perfil de aluno em seguida.
  }

  try {
    const student = await post('/api/student/auth/login', payload);
    finishLogin(student);
  } catch (error) {
    const map = {
      credenciais_invalidas: 'E-mail ou senha inválidos.',
      dados_invalidos: 'Informe e-mail e senha.',
      muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      banco_indisponivel: 'O sistema está iniciando. Tente novamente em alguns instantes.',
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

document.getElementById('password-toggle')?.addEventListener('click', () => {
  const visible = passwordField.type === 'text';
  passwordField.type = visible ? 'password' : 'text';
  const toggle = document.getElementById('password-toggle');
  toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
  toggle.querySelector('.eye-open')?.classList.toggle('hidden', !visible);
  toggle.querySelector('.eye-closed')?.classList.toggle('hidden', visible);
});

document.getElementById('login-form').addEventListener('submit', (event) => { event.preventDefault(); accountLogin(); });
document.getElementById('forgot-password-button').addEventListener('click', forgotPassword);
document.getElementById('forgot-form').addEventListener('submit', submitForgot);
document.getElementById('close-forgot').addEventListener('click', closeForgot);
document.getElementById('cancel-forgot').addEventListener('click', closeForgot);
document.getElementById('forgot-modal').addEventListener('click', (event) => { if (event.target.id === 'forgot-modal') closeForgot(); });
initGoogleLogin();
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !document.getElementById('forgot-modal').classList.contains('hidden')) closeForgot(); });
[emailField, passwordField].forEach((field) => field.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') accountLogin();
}));
