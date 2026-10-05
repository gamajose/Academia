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
    }
    return modal;
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
