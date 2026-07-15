const NAV_BUILD_VERSION = '20260713-0140';
const pageName = (value) => String(value || '').split('/').pop().split('?')[0].split('#')[0];
const pageUrl = (href) => `./${href}?v=${NAV_BUILD_VERSION}`;

if (['permissions.html', 'student-accounts.html'].includes(pageName(window.location.pathname))) {
  window.location.replace(pageUrl(pageName(window.location.pathname) === 'permissions.html' ? 'users.html' : 'alunos.html'));
}

function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadNavigationStyles() {
  loadStyle('./professional.css');
  loadStyle('./premium-ui.css');
  loadStyle('./blue-theme.css');
  loadStyle('./admin-nav-icons.css');
  loadStyle('./admin-profile.css');
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
  'pt-BR': { painel: 'Painel', alunos: 'Alunos', planos: 'Planos', matriculas: 'Matrículas', pre: 'Pré-matrículas', financeiro: 'Financeiro', alertas: 'Alertas', treinos: 'Treinos', avaliacoes: 'Avaliações', acesso: 'Acesso', funcionarios: 'Funcionários', perfil: 'Perfil', seguranca: 'Segurança', preferencias: 'Preferências', sair: 'Sair' },
  en: { painel: 'Dashboard', alunos: 'Members', planos: 'Plans', matriculas: 'Memberships', pre: 'Pre-enrollments', financeiro: 'Finance', alertas: 'Alerts', treinos: 'Training', avaliacoes: 'Assessments', acesso: 'Access', funcionarios: 'Staff', perfil: 'Profile', seguranca: 'Security', preferencias: 'Preferences', sair: 'Sign out' },
  es: { painel: 'Panel', alunos: 'Alumnos', planos: 'Planes', matriculas: 'Matrículas', pre: 'Preinscripciones', financeiro: 'Finanzas', alertas: 'Alertas', treinos: 'Entrenamientos', avaliacoes: 'Evaluaciones', acesso: 'Acceso', funcionarios: 'Personal', perfil: 'Perfil', seguranca: 'Seguridad', preferencias: 'Preferencias', sair: 'Salir' }
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
  const logout = document.getElementById('profile-logout');
  if (logout) logout.textContent = labels.sair;
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
  document.querySelectorAll('.top-nav-links a').forEach((link) => {
    link.hidden = !canSeePage(link.dataset.page || pageName(link.getAttribute('href')), role, accessProfile, user.access_permissions || null);
  });
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
  const pages = [
    ['painel.html', 'Painel', 'painel'], ['alunos.html', 'Alunos', 'alunos'], ['planos.html', 'Planos', 'planos'],
    ['vinculos.html', 'Matrículas', 'matriculas'], ['solicitacoes.html', 'Pré-matrículas', 'pre'],
    ['financeiro.html', 'Financeiro', 'financeiro'], ['alerts.html', 'Alertas', 'alertas'], ['training.html', 'Treinos', 'treinos'],
    ['assessments.html', 'Avaliações', 'avaliacoes'], ['access.html', 'Acesso', 'acesso'], ['users.html', 'Funcionários', 'funcionarios']
  ];
  const icons = {
    'painel.html': 'home', 'alunos.html': 'members', 'planos.html': 'plans', 'vinculos.html': 'membership',
    'solicitacoes.html': 'spark', 'financeiro.html': 'finance', 'alerts.html': 'alert',
    'training.html': 'dumbbell', 'assessments.html': 'chart', 'access.html': 'access', 'users.html': 'users'
  };

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <a class="top-nav-brand" href="${pageUrl('painel.html')}" aria-label="BlueREC Academia, voltar ao painel">
      <img class="top-nav-logo" src="./blue-rec-logo.png" alt="BlueREC Academia" width="36" height="36" />
      <span class="brand-wordmark"><strong><span class="brand-academia">Blue</span>REC</strong><small>academia e saúde</small></span>
    </a>
    <div class="top-nav-links">${pages.map(([href, label, key]) => `<a data-page="${href}" data-nav-key="${key}" class="${current === href ? 'active' : ''}" href="${pageUrl(href)}"><span class="nav-icon">${adminIconSvg(icons[href])}</span><span class="nav-label">${label}</span></a>`).join('')}</div>
    <div class="profile-menu">
      <button class="profile-trigger" id="profile-trigger" type="button" aria-label="Abrir perfil" title="Abrir perfil" aria-expanded="false">
        <span class="profile-avatar" id="profile-avatar">U</span>
        <span class="profile-copy"><strong id="profile-name">Meu perfil</strong><span id="profile-role">Perfil</span></span>
      </button>
      <div class="profile-dropdown hidden" id="profile-dropdown">
        <a href="${pageUrl('account.html')}">Perfil</a>
        <a href="${pageUrl('security.html')}">Segurança</a>
        <a id="profile-preferences" href="${pageUrl('account.html')}&view=preferences">Preferências</a>
        <button class="logout-item" id="profile-logout" type="button">Sair</button>
      </div>
    </div>`;
  document.body.prepend(nav);

  const trigger = document.getElementById('profile-trigger');
  const dropdown = document.getElementById('profile-dropdown');
  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  document.getElementById('profile-logout')?.addEventListener('click', clearSession);
  document.addEventListener('click', () => dropdown?.classList.add('hidden'));
  loadProfile();
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

loadNavigationStyles();
applyAdminPreferences();
requireSession();
renderNavigation();
upgradeModals();
