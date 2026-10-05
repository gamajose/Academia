(function () {
  function getApiBase() {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return window.location.origin;
    }
    return 'http://localhost:3004';
  }
  const API = getApiBase();

  function portalOn() {
    const token = localStorage.getItem('academiaToken') || '';
    if (token) document.cookie = `academiaAuth=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
  }

  function studentPortalOn() {
    const token = localStorage.getItem('studentToken') || '';
    if (token) document.cookie = `academiaStudentAuth=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
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
    window.location.href = data.account_type === 'visitor' ? './visitor-portal.html' : './student-portal.html';
  }

  function ensureModal() {
    let modal = document.getElementById('site-login-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'site-login-modal';
      modal.className = 'site-login-modal hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="site-login-card">
          <button type="button" class="modal-close" id="site-login-close" aria-label="Fechar">&times;</button>
          <form id="modal-login-form" novalidate>
            <h2 style="margin:0 0 18px;font-size:22px;">Acessar conta</h2>
            <div class="form-field">
              <label for="modal-email">E-mail ou telefone</label>
              <input id="modal-email" type="text" autocomplete="username" placeholder="E-mail ou telefone" required />
            </div>
            <div class="form-field">
              <label for="modal-password">Senha</label>
              <div class="password-field-wrapper">
                <input id="modal-password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required />
                <button class="password-toggle-eye" id="modal-password-toggle" type="button" aria-label="Mostrar senha" title="Mostrar senha">
                  <svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg class="eye-closed hidden" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
            <label class="remember-row"><input id="modal-remember" type="checkbox" /> <span>Manter conectado neste dispositivo</span></label>
            <button class="cta login-primary" id="modal-login-btn" type="submit">Entrar</button>
            <div class="auth-divider"><span>ou continue com</span></div>
            <div id="modal-google-btn" class="google-login-button"></div>
            <div class="login-secondary-actions">
              <a class="cta ghost" href="./student-register.html">Criar uma conta nova</a>
              <button class="cta ghost" id="modal-forgot-btn" type="button">Esqueci a senha</button>
            </div>
            <small class="login-message" id="modal-login-message" aria-live="polite"></small>
          </form>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = document.getElementById('site-login-close');
      closeBtn?.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      const toggleBtn = document.getElementById('modal-password-toggle');
      const passInput = document.getElementById('modal-password');
      toggleBtn?.addEventListener('click', () => {
        const visible = passInput.type === 'text';
        passInput.type = visible ? 'password' : 'text';
        toggleBtn.querySelector('.eye-open')?.classList.toggle('hidden', !visible);
        toggleBtn.querySelector('.eye-closed')?.classList.toggle('hidden', visible);
      });

      document.getElementById('modal-forgot-btn')?.addEventListener('click', () => {
        window.location.href = './student-login.html#esqueci';
      });

      document.getElementById('modal-login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('modal-email');
        const passEl = document.getElementById('modal-password');
        const msgEl = document.getElementById('modal-login-message');
        const btn = document.getElementById('modal-login-btn');

        const identifier = emailEl.value.trim();
        const password = passEl.value;
        if (!identifier || !password) {
          msgEl.textContent = 'Informe e-mail ou telefone e senha.';
          (identifier ? passEl : emailEl).focus();
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Entrando...';
        msgEl.textContent = 'Validando acesso...';

        try {
          const res = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
          });
          const admin = await res.json().catch(() => ({}));
          if (res.ok) {
            finishLogin({ ...admin, account_type: 'admin' });
            return;
          }
        } catch (_) {}

        try {
          const sRes = await fetch(`${API}/api/student/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
          });
          const student = await sRes.json().catch(() => ({}));
          if (sRes.ok) {
            finishLogin(student);
            return;
          }
          const map = {
            credenciais_invalidas: 'E-mail ou senha inválidos.',
            dados_invalidos: 'Informe e-mail e senha.',
            muitas_tentativas: 'Muitas tentativas. Aguarde e tente novamente.'
          };
          msgEl.textContent = map[student.error] || 'Não foi possível entrar. Confira os dados.';
        } catch (err) {
          msgEl.textContent = 'Erro ao conectar. Tente novamente.';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      });

      initGoogleAuth(modal);
    }
    return modal;
  }

  async function initGoogleAuth(modal) {
    const container = modal.querySelector('#modal-google-btn');
    if (!container) return;

    if (!document.getElementById('google-gsi-client')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    try {
      const res = await fetch(`${API}/api/auth/google/config`);
      const config = await res.json().catch(() => ({}));
      if (config.enabled && config.client_id) {
        for (let i = 0; i < 40 && !window.google?.accounts?.id; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: config.client_id,
            callback: async ({ credential }) => {
              const msgEl = modal.querySelector('#modal-login-message');
              if (msgEl) msgEl.textContent = 'Autenticando com Google...';
              try {
                const gRes = await fetch(`${API}/api/auth/google`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id_token: credential })
                });
                const gData = await gRes.json().catch(() => ({}));
                if (!gRes.ok) throw new Error(gData.error || 'erro_google');
                finishLogin(gData);
              } catch (err) {
                if (msgEl) msgEl.textContent = err.message === 'google_nao_configurado'
                  ? 'Login com Google indisponível no momento.'
                  : 'Falha no login com Google.';
              }
            }
          });
          window.google.accounts.id.renderButton(container, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            width: 320
          });
          return;
        }
      }
    } catch (_) {}

    container.innerHTML = `
      <button type="button" class="google-custom-btn" id="modal-google-custom-btn">
        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
        <span>Entrar com Gmail / Google</span>
      </button>
    `;
    modal.querySelector('#modal-google-custom-btn')?.addEventListener('click', () => {
      const msgEl = modal.querySelector('#modal-login-message');
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
      } else {
        if (msgEl) msgEl.textContent = 'Acesso Google: configure o Client ID ou use e-mail e senha.';
      }
    });
  }

  function openModal() {
    const modal = ensureModal();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('modal-email')?.focus(), 50);
  }

  function closeModal() {
    const modal = document.getElementById('site-login-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-login], #nav-login-btn, #hero-login-btn, #footer-login-btn, .nav-access');
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  });

  window.SiteAuth = { open: openModal, close: closeModal };
}());
