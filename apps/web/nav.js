const NAV_BUILD_VERSION = '20260713-0140';
const pageName = (value) => String(value || '').split('/').pop().split('?')[0].split('#')[0];
const pageUrl = (href) => `./${href}?v=${NAV_BUILD_VERSION}`;

if (!window.AcademiaModules) {
  const moduleScript = document.createElement('script');
  moduleScript.src = './module-settings.js?v=20260716-1';
  document.head.appendChild(moduleScript);
}

if (!window.AcademiaCommandPalette) {
  const cmdScript = document.createElement('script');
  cmdScript.src = './admin-command-palette.js?v=20261004-1';
  document.head.appendChild(cmdScript);
}

if (['permissions.html', 'student-accounts.html'].includes(pageName(window.location.pathname))) {
  window.location.replace(pageUrl(pageName(window.location.pathname) === 'permissions.html' ? 'users.html' : 'alunos.html'));
}

function loadStyle(href) {
  const existing = document.querySelector(`link[href="${href}"]`);
  if (existing) {
    if (existing.sheet || existing.dataset.loaded) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => resolve();
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, 2500);
    });
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return new Promise((resolve) => {
    const finish = () => resolve();
    link.addEventListener('load', finish, { once: true });
    link.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, 2500);
  });
}

function loadNavigationStyles() {
  return Promise.all([
    loadStyle('./professional.css'),
    loadStyle('./premium-ui.css'),
    loadStyle('./blue-theme.css'),
    loadStyle('./admin-nav-icons.css'),
    loadStyle('./admin-mobile-nav.css?v=20260716-2'),
    loadStyle('./admin-profile.css'),
    loadStyle('./admin-dark-theme.css?v=20260715-1015'),
    loadStyle('./admin-desktop-nav.css?v=20260716-1'),
    loadStyle('./admin-command-palette.css?v=20261004-1')
  ]);
}

function applyAdminPreferences(preferences = {}) {
  const saved = {
    language: preferences.language || localStorage.getItem('adminLanguage') || 'pt-BR',
    theme: preferences.theme || localStorage.getItem('adminTheme') || 'light',
    accent: preferences.accent || localStorage.getItem('adminAccent') || 'blue'
  };
  document.documentElement.dataset.adminTheme = saved.theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : saved.theme;
  document.documentElement.dataset.adminAccent = saved.accent;
  document.documentElement.lang = saved.language;
  localStorage.setItem('adminLanguage', saved.language);
  localStorage.setItem('adminTheme', saved.theme);
  localStorage.setItem('adminAccent', saved.accent);
  applyAdminLanguage(saved.language);
}

const adminNavLabels = {
  'pt-BR': { painel: 'Painel', alunos: 'Alunos', planos: 'Planos', matriculas: 'Matrículas', pre: 'Pré-matrículas', financeiro: 'Financeiro', alertas: 'Alertas', treinos: 'Treinos', avaliacoes: 'Avaliações', acesso: 'Acessos', funcionarios: 'Funcionários', perfil: 'Perfil', seguranca: 'Segurança', preferencias: 'Preferências', configuracoes: 'Configurações', sair: 'Sair', mais: 'Mais' },
  en: { painel: 'Dashboard', alunos: 'Members', planos: 'Plans', matriculas: 'Memberships', pre: 'Pre-enrollments', financeiro: 'Finance', alertas: 'Alerts', treinos: 'Training', avaliacoes: 'Assessments', acesso: 'Access', funcionarios: 'Staff', perfil: 'Profile', seguranca: 'Security', preferencias: 'Preferences', configuracoes: 'Settings', sair: 'Sign out', mais: 'More' },
  es: { painel: 'Panel', alunos: 'Alumnos', planos: 'Planes', matriculas: 'Matrículas', pre: 'Preinscripciones', financeiro: 'Finanzas', alertas: 'Alertas', treinos: 'Entrenamientos', avaliacoes: 'Evaluaciones', acesso: 'Accesos', funcionarios: 'Personal', perfil: 'Perfil', seguranca: 'Seguridad', preferencias: 'Preferencias', configuracoes: 'Configuración', sair: 'Salir', mais: 'Más' }
};

function applyAdminLanguage(language = 'pt-BR') {
  const labels = adminNavLabels[language] || adminNavLabels['pt-BR'];
  document.querySelectorAll('.top-nav-links a[data-nav-key]').forEach((link) => {
    const label = link.querySelector('.nav-label');
    if (label && labels[link.dataset.navKey]) label.textContent = labels[link.dataset.navKey];
  });
  const profileLinks = document.querySelectorAll('#profile-dropdown a');
  if (profileLinks[0]) profileLinks[0].textContent = labels.perfil;
  if (profileLinks[1]) profileLinks[1].textContent = labels.seguranca;
  if (profileLinks[2]) profileLinks[2].textContent = labels.preferencias;
  if (profileLinks[3]) profileLinks[3].textContent = labels.configuracoes;
  const logout = document.getElementById('profile-logout');
  if (logout) logout.textContent = labels.sair;
  document.querySelectorAll('[data-mobile-nav-key]').forEach((element) => {
    if (labels[element.dataset.mobileNavKey]) element.textContent = labels[element.dataset.mobileNavKey];
  });
}

function renderAvatar(host, name, photoUrl = '') {
  if (!host) return;
  host.replaceChildren();
  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = '';
    image.onerror = () => { host.textContent = name.trim().charAt(0).toUpperCase() || 'U'; };
    host.appendChild(image);
    return;
  }
  host.textContent = name.trim().charAt(0).toUpperCase() || 'U';
}

function clearSession() {
  localStorage.removeItem('academiaToken');
  localStorage.removeItem('academiaUserName');
  localStorage.removeItem('academiaRole');
  localStorage.removeItem('academiaAccessProfile');
  localStorage.removeItem('academiaAccessProfileName');
  localStorage.removeItem('academiaAccessPermissions');
  document.cookie = 'academiaAuth=; Path=/; Max-Age=0; SameSite=Lax';
  window.location.href = pageUrl('student-login.html');
}

function roleLabel(role, accessProfile = '', accessProfileName = '') {
  if (role === 'owner') return 'Proprietário';
  if (accessProfileName) return accessProfileName;
  if (role === 'admin') return 'Administrador';
  if (role === 'staff' && accessProfile === 'trainer') return 'Personal trainer';
  if (role === 'staff' && accessProfile === 'reception') return 'Recepção';
  return ({ staff: 'Equipe', operator: 'Operação' })[role] || 'Usuário';
}

function canSeePage(href, role, accessProfile, permissions = null) {
  if (role === 'owner' || (role === 'admin' && !permissions)) return true;
  const pageModules = {
    'painel.html': 'dashboard', 'alunos.html': 'members', 'planos.html': 'plans',
    'vinculos.html': 'memberships', 'solicitacoes.html': 'pre_enrollments',
    'financeiro.html': 'finance', 'alerts.html': 'alerts', 'training.html': 'training',
    'assessments.html': 'assessments', 'access.html': 'access', 'users.html': 'users'
  };
  if (permissions && pageModules[href]) return permissions[pageModules[href]] === true;
  if (role === 'staff' && accessProfile === 'trainer') return ['painel.html', 'alunos.html', 'training.html', 'assessments.html'].includes(href);
  if (role === 'staff') return ['painel.html', 'alunos.html', 'vinculos.html', 'solicitacoes.html', 'alerts.html'].includes(href);
  if (role === 'operator') return ['painel.html'].includes(href);
  return false;
}

function applyNavPermissions(user) {
  const role = user.role || '';
  const accessProfile = user.access_profile || (role === 'staff' ? 'reception' : role === 'operator' ? 'operator' : 'admin');
  document.querySelectorAll('.top-nav-links a, .admin-mobile-nav a[data-page], .admin-more-menu a[data-page]').forEach((link) => {
    const href = link.dataset.page || pageName(link.getAttribute('href'));
    const module = pageModule(href);
    const enabled = !module || (user.enabled_modules || window.AcademiaModules?.cached?.() || {})[module] !== false;
    link.hidden = !enabled || !canSeePage(href, role, accessProfile, user.access_permissions || null);
  });
  const settingsLinks = document.querySelectorAll('#profile-settings, .admin-more-account a[href*="settings.html"]');
  settingsLinks.forEach((link) => { link.hidden = !['owner', 'admin'].includes(role); });
  document.querySelectorAll('[data-module-feature]').forEach((element) => {
    element.hidden = (user.enabled_modules || window.AcademiaModules?.cached?.() || {})[element.dataset.moduleFeature] === false;
  });
}

function pageModule(href) {
  return {
    'painel.html': 'dashboard', 'alunos.html': 'members', 'planos.html': 'plans',
    'vinculos.html': 'memberships', 'solicitacoes.html': 'pre_enrollments', 'financeiro.html': 'finance',
    'alerts.html': 'alerts', 'training.html': 'training', 'assessments.html': 'assessments',
    'access.html': 'access', 'users.html': 'users'
  }[href] || '';
}

function adminIconSvg(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"/>',
    members: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 6"/>',
    plans: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    membership: '<path d="M5 12h14M12 5v14"/>',
    spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
    finance: '<path d="M4 19V5M4 19h16M8 16v-4M12 16V7M16 16v-6"/>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11M3 9h3.5v6H3zM17.5 9H21v6h-3.5z"/>',
    chart: '<path d="M4 19V5M4 19h16M8 15v-3M12 15V8M16 15v-6"/>',
    access: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    users: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 20a5 5 0 0 1 6 0"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.plans}</svg>`;
}

function renderNavigation() {
  loadNavigationStyles();
  document.querySelectorAll('a[href*="permissions.html"], a[href*="student-accounts.html"]').forEach((link) => link.remove());

  const current = pageName(window.location.pathname) || 'painel.html';
  const adminPages = ['painel.html', 'alunos.html', 'planos.html', 'vinculos.html', 'solicitacoes.html', 'financeiro.html', 'alerts.html', 'training.html', 'assessments.html', 'access.html', 'users.html', 'account.html', 'security.html', 'settings.html', 'exports.html', 'reports.html', 'student-report.html', 'assessment-actions.html'];
  if (adminPages.includes(current)) document.documentElement.dataset.adminShell = 'true';
  const pages = [
    ['painel.html', 'Painel', 'painel'], ['alunos.html', 'Alunos', 'alunos'], ['planos.html', 'Planos', 'planos'],
    ['vinculos.html', 'Matrículas', 'matriculas'], ['solicitacoes.html', 'Pré-matrículas', 'pre'],
    ['financeiro.html', 'Financeiro', 'financeiro'], ['training.html', 'Treinos', 'treinos'],
    ['access.html', 'Acesso', 'acesso'], ['users.html', 'Funcionários', 'funcionarios']
  ];
  const icons = {
    'painel.html': 'home', 'alunos.html': 'members', 'planos.html': 'plans', 'vinculos.html': 'membership',
    'solicitacoes.html': 'spark', 'financeiro.html': 'finance', 'alerts.html': 'alert',
    'training.html': 'dumbbell', 'assessments.html': 'chart', 'access.html': 'access', 'users.html': 'users'
  };

  const savedLogo = localStorage.getItem('gymLogoUrl') || './blue-rec-logo.png';
  const savedGymName = localStorage.getItem('gymName') || 'BlueREC Academia';

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <a class="top-nav-brand logo-only" href="${pageUrl('painel.html')}" aria-label="${savedGymName}, voltar ao painel" title="${savedGymName}">
      <img class="top-nav-logo" src="${savedLogo}" alt="Logo da ${savedGymName}" width="36" height="36" />
    </a>
    <div class="top-nav-links">${pages.map(([href, label, key]) => `<a data-page="${href}" data-nav-key="${key}" class="${current === href ? 'active' : ''}" href="${pageUrl(href)}"><span class="nav-icon">${adminIconSvg(icons[href])}</span><span class="nav-label">${label}</span></a>`).join('')}</div>
    <div class="profile-menu">
      <button class="profile-trigger" id="profile-trigger" type="button" aria-label="Abrir perfil" title="Abrir perfil" aria-expanded="false">
        <span class="profile-avatar" id="profile-avatar">U</span>
        <span class="profile-copy"><strong id="profile-name">Meu perfil</strong><span id="profile-role">Perfil</span></span>
      </button>
      <div class="profile-dropdown hidden" id="profile-dropdown">
        <a href="${pageUrl('account.html')}">Perfil</a>
        <a id="profile-preferences" href="#preferences">Preferências</a>
        <a id="profile-settings" href="${pageUrl('settings.html')}">Configurações</a>
        <button class="logout-item" id="profile-logout" type="button">Sair</button>
      </div>
    </div>`;
  document.body.prepend(nav);
  renderAdminMobileNavigation(current, pages, icons);

  const brandLink = nav.querySelector('.top-nav-brand');
  brandLink?.addEventListener('click', (event) => {
    const role = localStorage.getItem('academiaRole') || '';
    if (['owner', 'admin'].includes(role)) {
      event.preventDefault();
      openBrandModal();
    }
  });

  const trigger = document.getElementById('profile-trigger');
  const dropdown = document.getElementById('profile-dropdown');
  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  document.getElementById('profile-preferences')?.addEventListener('click', (event) => {
    event.preventDefault();
    dropdown?.classList.add('hidden');
    openGlobalPreferencesModal();
  });
  document.getElementById('profile-logout')?.addEventListener('click', clearSession);
  document.addEventListener('click', () => dropdown?.classList.add('hidden'));
  loadProfile();
}

function openBrandModal() {
  let modal = document.getElementById('gym-brand-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal hidden';
    modal.id = 'gym-brand-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <div><h3 style="margin:0 0 4px;font-size:18px;">Identidade da Academia</h3><p style="margin:0;font-size:13px;color:var(--muted);">Altere a logo e o nome da academia exibidos no sistema.</p></div>
          <button class="modal-close" id="close-brand-modal" type="button" aria-label="Fechar">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;padding:12px 0;">
          <div class="field">
            <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block;">Logo da Academia</label>
            <div style="display:flex;align-items:center;gap:14px;">
              <img id="nav-brand-modal-preview" src="${localStorage.getItem('gymLogoUrl') || './blue-rec-logo.png'}" width="56" height="56" style="border-radius:12px;border:1px solid var(--line);object-fit:contain;background:#f8fafc;padding:4px;" />
              <div style="display:flex;flex-direction:column;gap:8px;flex:1;">
                <button type="button" class="button secondary" id="nav-brand-file-btn" style="font-size:13px;padding:6px 12px;align-self:flex-start;">Escolher imagem</button>
                <input type="file" id="nav-brand-file" accept="image/jpeg,image/png,image/webp,image/svg+xml" hidden />
                <input type="url" id="nav-brand-url" placeholder="Ou cole o link direto da imagem" style="font-size:13px;padding:6px 10px;" value="${localStorage.getItem('gymLogoUrl') || ''}" />
              </div>
            </div>
          </div>
          <div class="field">
            <label for="nav-brand-name" style="font-size:13px;font-weight:600;margin-bottom:6px;display:block;">Nome da Academia</label>
            <input id="nav-brand-name" value="${localStorage.getItem('gymName') || ''}" placeholder="Ex.: Performance Fitness" />
          </div>
          <div class="field">
            <label for="nav-brand-pix" style="font-size:13px;font-weight:600;margin-bottom:6px;display:block;">Chave Pix Padrão</label>
            <input id="nav-brand-pix" value="${localStorage.getItem('gymPixKey') || ''}" placeholder="Ex.: financeiro@academia.com.br ou CNPJ" />
          </div>
          <p class="status-line" id="nav-brand-status" aria-live="polite" style="margin:0;font-size:13px;"></p>
          <div class="form-actions" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <a href="${pageUrl('painel.html')}" id="nav-brand-go-painel" style="font-size:13px;color:var(--muted);text-decoration:none;">Ir ao Painel</a>
            <div style="display:flex;gap:8px;">
              <button class="secondary" type="button" id="cancel-brand-modal">Cancelar</button>
              <button type="button" id="save-brand-modal" class="button">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.add('hidden');
    modal.querySelector('#close-brand-modal')?.addEventListener('click', close);
    modal.querySelector('#cancel-brand-modal')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const fileBtn = modal.querySelector('#nav-brand-file-btn');
    const fileInput = modal.querySelector('#nav-brand-file');
    const urlInput = modal.querySelector('#nav-brand-url');
    const preview = modal.querySelector('#nav-brand-modal-preview');

    fileBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => { if (preview) preview.src = evt.target.result; };
        reader.readAsDataURL(file);
      }
    });
    urlInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (preview && val) preview.src = val;
    });

    modal.querySelector('#save-brand-modal')?.addEventListener('click', async () => {
      const saveBtn = modal.querySelector('#save-brand-modal');
      const status = modal.querySelector('#nav-brand-status');
      saveBtn.disabled = true;
      status.textContent = 'Salvando identidade...';
      try {
        let logoUrl = urlInput.value.trim();
        const file = fileInput.files?.[0];
        const token = localStorage.getItem('academiaToken') || '';
        const host = window.location.hostname || 'localhost';
        const api = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;

        if (file) {
          const form = new FormData();
          form.append('file', file, file.name);
          const uploadRes = await fetch(`${api}/api/editor/images`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
          });
          const uploadData = await uploadRes.json().catch(() => ({}));
          if (uploadData.location) logoUrl = uploadData.location;
        }

        const brandName = modal.querySelector('#nav-brand-name').value.trim();
        const brandPix = modal.querySelector('#nav-brand-pix').value.trim();

        const res = await fetch(`${api}/api/gym/profile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: brandName || undefined,
            logo_url: logoUrl || undefined,
            pix_key: brandPix || undefined
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar identidade');

        if (data.logo_url) {
          localStorage.setItem('gymLogoUrl', data.logo_url);
          document.querySelectorAll('.top-nav-logo').forEach((img) => { img.src = data.logo_url; });
        }
        if (data.name) {
          localStorage.setItem('gymName', data.name);
          document.querySelectorAll('.top-nav-brand').forEach((el) => { el.title = data.name; });
        }
        if (data.pix_key) localStorage.setItem('gymPixKey', data.pix_key);

        window.dispatchEvent(new CustomEvent('academia:brand-updated', { detail: data }));
        status.textContent = 'Identidade atualizada com sucesso!';
        setTimeout(close, 700);
      } catch (err) {
        status.textContent = `Erro: ${err.message}`;
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  const currentLogo = localStorage.getItem('gymLogoUrl') || './blue-rec-logo.png';
  const currentName = localStorage.getItem('gymName') || '';
  const currentPix = localStorage.getItem('gymPixKey') || '';
  const preview = modal.querySelector('#nav-brand-modal-preview');
  const nameInp = modal.querySelector('#nav-brand-name');
  const pixInp = modal.querySelector('#nav-brand-pix');
  const urlInp = modal.querySelector('#nav-brand-url');
  if (preview) preview.src = currentLogo;
  if (nameInp) nameInp.value = currentName;
  if (pixInp) pixInp.value = currentPix;
  if (urlInp) urlInp.value = currentLogo.startsWith('data:') || currentLogo.startsWith('/') || currentLogo.startsWith('http') ? currentLogo : '';

  modal.classList.remove('hidden');
}

function openGlobalPreferencesModal() {
  let modal = document.getElementById('preferences-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal hidden';
    modal.id = 'preferences-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'preferences-title');
    modal.innerHTML = `
      <div class="modal-card preferences-modal-card">
        <div class="modal-header">
          <div><h3 id="preferences-title">Preferências</h3></div>
          <button class="modal-close" id="close-preferences-button" type="button" aria-label="Fechar">×</button>
        </div>
        <div class="preferences-modal-grid">
          <div class="field"><label for="profile-language">Idioma</label><select id="profile-language"><option value="pt-BR">Português</option><option value="en">English</option><option value="es">Español</option></select></div>
          <div class="field"><label for="profile-theme">Tema</label><select id="profile-theme"><option value="light">Claro</option><option value="dark">Escuro</option><option value="system">Automático</option></select></div>
        </div>
        <fieldset class="accent-picker">
          <legend>Cor de destaque</legend>
          <div class="accent-options" role="radiogroup" aria-label="Escolha a cor de destaque">
            <label class="accent-option"><input type="radio" name="profile-accent" value="blue"><span class="accent-swatch accent-blue"></span><span>Azul</span></label>
            <label class="accent-option"><input type="radio" name="profile-accent" value="cyan"><span class="accent-swatch accent-cyan"></span><span>Ciano</span></label>
            <label class="accent-option"><input type="radio" name="profile-accent" value="violet"><span class="accent-swatch accent-violet"></span><span>Violeta</span></label>
            <label class="accent-option"><input type="radio" name="profile-accent" value="green"><span class="accent-swatch accent-green"></span><span>Verde</span></label>
            <label class="accent-option"><input type="radio" name="profile-accent" value="orange"><span class="accent-swatch accent-orange"></span><span>Laranja</span></label>
            <label class="accent-option"><input type="radio" name="profile-accent" value="rose"><span class="accent-swatch accent-rose"></span><span>Rosa</span></label>
          </div>
        </fieldset>
        <div class="form-actions preferences-modal-actions"><button class="secondary" id="cancel-preferences-button" type="button">Cancelar</button><button id="save-preferences-button" type="button">Salvar</button></div>
        <p class="status-line" id="preferences-status"></p>
      </div>`;
    document.body.appendChild(modal);
  }

  const close = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  };
  modal.querySelector('#close-preferences-button')?.addEventListener('click', close);
  modal.querySelector('#cancel-preferences-button')?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  const preview = () => {
    const lang = modal.querySelector('#profile-language')?.value || 'pt-BR';
    const theme = modal.querySelector('#profile-theme')?.value || 'light';
    const accent = modal.querySelector('input[name="profile-accent"]:checked')?.value || 'blue';
    if (typeof applyAdminPreferences === 'function') {
      applyAdminPreferences({ language: lang, theme, accent });
    }
  };
  modal.querySelector('#profile-language')?.addEventListener('change', preview);
  modal.querySelector('#profile-theme')?.addEventListener('change', preview);
  modal.querySelectorAll('input[name="profile-accent"]').forEach((input) => input.addEventListener('change', preview));

  const saveBtn = modal.querySelector('#save-preferences-button');
  if (saveBtn && !saveBtn.dataset.wired) {
    saveBtn.dataset.wired = 'true';
    saveBtn.addEventListener('click', async () => {
      const status = modal.querySelector('#preferences-status');
      saveBtn.disabled = true;
      if (status) status.textContent = 'Salvando preferências...';
      try {
        const lang = modal.querySelector('#profile-language')?.value || 'pt-BR';
        const theme = modal.querySelector('#profile-theme')?.value || 'light';
        const accent = modal.querySelector('input[name="profile-accent"]:checked')?.value || 'blue';
        const preferences = { language: lang, theme, accent };

        const token = localStorage.getItem('academiaToken') || '';
        const host = window.location.hostname || 'localhost';
        const api = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;

        if (token) {
          await fetch(`${api}/api/me/preferences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(preferences)
          });
        }
        localStorage.setItem('adminLanguage', preferences.language);
        localStorage.setItem('adminTheme', preferences.theme);
        localStorage.setItem('adminAccent', preferences.accent);
        if (typeof applyAdminPreferences === 'function') applyAdminPreferences(preferences);
        if (status) status.textContent = 'Preferências salvas.';
        setTimeout(close, 500);
      } catch (err) {
        if (status) status.textContent = `Erro ao salvar preferências: ${err.message}`;
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  const currentLang = localStorage.getItem('adminLanguage') || 'pt-BR';
  const currentTheme = localStorage.getItem('adminTheme') || 'light';
  const currentAccent = localStorage.getItem('adminAccent') || 'blue';

  const langSelect = modal.querySelector('#profile-language');
  const themeSelect = modal.querySelector('#profile-theme');
  const accentInput = modal.querySelector(`input[name="profile-accent"][value="${currentAccent}"]`);
  if (langSelect) langSelect.value = currentLang;
  if (themeSelect) themeSelect.value = currentTheme;
  if (accentInput) accentInput.checked = true;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function renderAdminMobileNavigation(current, pages, icons) {
  const bottomItems = [
    ['painel.html', 'painel', 'home'],
    ['alunos.html', 'alunos', 'members'],
    ['training.html', 'treinos', 'dumbbell'],
    ['access.html', 'acesso', 'access']
  ];
  const labels = adminNavLabels[localStorage.getItem('adminLanguage') || 'pt-BR'] || adminNavLabels['pt-BR'];
  const mobile = document.createElement('nav');
  mobile.className = 'admin-mobile-nav';
  mobile.setAttribute('aria-label', 'Navegação principal do administrador');
  mobile.innerHTML = bottomItems.map(([href, key, icon]) => `<a data-page="${href}" class="${current === href ? 'active' : ''}" href="${pageUrl(href)}"><span class="nav-icon">${adminIconSvg(icon)}</span><span class="nav-label" data-mobile-nav-key="${key}">${labels[key]}</span></a>`).join('');
  document.body.appendChild(mobile);

  const more = document.createElement('div');
  more.className = 'admin-more';
  const extraPages = pages.filter(([href]) => !bottomItems.some(([mobileHref]) => mobileHref === href));
  more.innerHTML = `
    <button class="admin-more-trigger" id="admin-more-trigger" type="button" aria-label="Abrir mais opções" aria-expanded="false" aria-controls="admin-more-menu"><span aria-hidden="true">⋮</span></button>
    <div class="admin-more-menu hidden" id="admin-more-menu" role="menu">
      <div class="admin-more-heading"><span>${labels.mais}</span><button type="button" id="admin-more-close" aria-label="Fechar">×</button></div>
      <div class="admin-more-links">${extraPages.map(([href, , key]) => `<a data-page="${href}" href="${pageUrl(href)}"><span class="nav-icon">${adminIconSvg(icons[href])}</span><span data-mobile-nav-key="${key}">${labels[key]}</span></a>`).join('')}</div>
      <div class="admin-more-account">
        <a href="${pageUrl('account.html')}">${labels.perfil}</a>
        <a id="admin-mobile-preferences" href="#preferences">${labels.preferencias}</a>
        <a href="${pageUrl('settings.html')}">${labels.configuracoes || 'Configurações'}</a>
        <button class="logout-item" id="admin-mobile-logout" type="button">${labels.sair}</button>
      </div>
    </div>`;
  document.querySelector('.top-nav')?.appendChild(more);
  const trigger = document.getElementById('admin-more-trigger');
  const menu = document.getElementById('admin-more-menu');
  const close = () => { menu?.classList.add('hidden'); trigger?.setAttribute('aria-expanded', 'false'); };
  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    trigger.setAttribute('aria-expanded', String(opening));
  });
  document.getElementById('admin-more-close')?.addEventListener('click', close);
  document.getElementById('admin-mobile-preferences')?.addEventListener('click', (event) => {
    event.preventDefault();
    close();
    openGlobalPreferencesModal();
  });
  document.getElementById('admin-mobile-logout')?.addEventListener('click', clearSession);
  menu?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', close);
}

async function loadProfile() {
  const token = localStorage.getItem('academiaToken') || '';
  if (!token) return;
  const host = window.location.hostname || 'localhost';
  const api = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
  try {
    const response = await fetch(`${api}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const user = await response.json();
    user.enabled_modules = await waitForModuleSettings(token);
    const currentModule = pageModule(pageName(window.location.pathname));
    if (currentModule && user.enabled_modules[currentModule] === false) {
      const fallback = ['dashboard', 'members', 'training'].find((key) => user.enabled_modules[key] !== false);
      const fallbackPages = { dashboard: 'painel.html', members: 'alunos.html', training: 'training.html' };
      window.location.replace(pageUrl(fallbackPages[fallback] || 'settings.html'));
      return;
    }
    localStorage.setItem('academiaUserName', user.name || 'Meu perfil');
    localStorage.setItem('academiaRole', user.role || '');
    localStorage.setItem('academiaAccessProfile', user.access_profile || '');
    localStorage.setItem('academiaAccessProfileName', user.access_profile_name || '');
    localStorage.setItem('academiaAccessPermissions', JSON.stringify(user.access_permissions || {}));
    applyNavPermissions(user);
    const name = user.name || 'Meu perfil';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = roleLabel(user.role, user.access_profile, user.access_profile_name);
    renderAvatar(document.getElementById('profile-avatar'), name, user.profile_photo_url);
    applyAdminPreferences(user.profile_preferences);
    document.getElementById('profile-trigger')?.setAttribute('title', name);
    const accountName = document.getElementById('account-name');
    const accountRole = document.getElementById('account-role');
    if (accountName) accountName.textContent = name;
    if (accountRole) accountRole.textContent = `${roleLabel(user.role, user.access_profile, user.access_profile_name)} · permissões definidas pelo perfil`;

    try {
      const gymRes = await fetch(`${api}/api/gym/profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (gymRes.ok) {
        const gym = await gymRes.json();
        if (gym.logo_url) {
          localStorage.setItem('gymLogoUrl', gym.logo_url);
          document.querySelectorAll('.top-nav-logo').forEach((img) => { img.src = gym.logo_url; });
        }
        if (gym.name) {
          localStorage.setItem('gymName', gym.name);
          document.querySelectorAll('.top-nav-brand').forEach((el) => { el.title = gym.name; });
        }
        if (gym.pix_key) localStorage.setItem('gymPixKey', gym.pix_key);
      }
    } catch (_) {}
  } catch (_) {
    const role = localStorage.getItem('academiaRole') || '';
    const accessProfile = localStorage.getItem('academiaAccessProfile') || '';
    const accessProfileName = localStorage.getItem('academiaAccessProfileName') || '';
    applyNavPermissions({ role, access_profile: accessProfile, access_profile_name: accessProfileName });
    const name = localStorage.getItem('academiaUserName') || 'Meu perfil';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = roleLabel(role, accessProfile, accessProfileName);
    renderAvatar(document.getElementById('profile-avatar'), name);
    document.getElementById('profile-trigger')?.setAttribute('title', name);
    const accountName = document.getElementById('account-name');
    const accountRole = document.getElementById('account-role');
    if (accountName) accountName.textContent = name;
    if (accountRole) accountRole.textContent = roleLabel(role, accessProfile);
  }
}

async function waitForModuleSettings(token) {
  for (let attempt = 0; attempt < 20 && !window.AcademiaModules; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  return window.AcademiaModules?.load ? window.AcademiaModules.load(token) : {};
}

function requireSession() {
  const publicPages = ['home.html', 'index.html', 'plans.html', 'matricula-publica.html', 'student-login.html', 'admin.html'];
  const current = pageName(window.location.pathname) || 'index.html';
  const token = localStorage.getItem('academiaToken') || '';
  if (!token && !publicPages.includes(current)) window.location.href = pageUrl('student-login.html');
}

function upgradeModals() {
  const modals = [...document.querySelectorAll('.modal')];
  for (const modal of modals) {
    const close = [...modal.querySelectorAll('button')].find((button) => button.id.startsWith('close-') || button.textContent.trim().toLowerCase() === 'fechar');
    if (close) {
      close.textContent = '×';
      close.classList.add('modal-close');
      close.setAttribute('aria-label', 'Fechar');
      close.title = 'Fechar';
    }
    modal.addEventListener('click', (event) => {
      if (event.target === modal && !modal.classList.contains('modal-static')) close?.click();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
    if (!open) return;
    const close = [...open.querySelectorAll('button')].find((button) => button.id.startsWith('close-') || button.classList.contains('modal-close'));
    close?.click();
  });
}

async function initializeNavigation() {
  applyAdminPreferences();
  requireSession();
  try {
    await loadNavigationStyles();
  } finally {
    renderNavigation();
    upgradeModals();
    window.requestAnimationFrame(() => {
      window.clearTimeout(window.__uiBootFallback);
      document.documentElement.classList.remove('ui-booting');
    });
  }
}

initializeNavigation();
