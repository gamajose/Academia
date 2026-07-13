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

function renderNavigation() {
  loadNavigationStyles();
  document.querySelectorAll('a[href*="permissions.html"], a[href*="student-accounts.html"]').forEach((link) => link.remove());

  const current = pageName(window.location.pathname) || 'painel.html';
  const pages = [
    ['painel.html', 'Painel'], ['alunos.html', 'Alunos'], ['planos.html', 'Planos'],
    ['vinculos.html', 'Matrículas'], ['solicitacoes.html', 'Pré-matrículas'],
    ['financeiro.html', 'Financeiro'], ['alerts.html', 'Alertas'], ['training.html', 'Treinos'],
    ['assessments.html', 'Avaliações'], ['access.html', 'Acesso'], ['users.html', 'Funcionários']
  ];

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <a class="top-nav-brand" href="${pageUrl('painel.html')}" aria-label="BlueREC Academia, voltar ao painel">
      <img class="top-nav-logo" src="./blue-rec-logo.png" alt="BlueREC Academia" width="36" height="36" />
      <span class="brand-wordmark"><strong><span class="brand-academia">Blue</span>REC</strong><small>academia e saúde</small></span>
    </a>
    <div class="top-nav-links">${pages.map(([href, label]) => `<a data-page="${href}" class="${current === href ? 'active' : ''}" href="${pageUrl(href)}">${label}</a>`).join('')}</div>
    <div class="profile-menu">
      <button class="profile-trigger" id="profile-trigger" type="button" aria-expanded="false">
        <span class="profile-avatar" id="profile-avatar">U</span>
        <span class="profile-copy"><strong id="profile-name">Meu perfil</strong><span id="profile-role">Perfil</span></span>
      </button>
      <div class="profile-dropdown hidden" id="profile-dropdown">
        <a href="${pageUrl('account.html')}">Perfil</a>
        <a href="${pageUrl('security.html')}">Segurança</a>
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
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
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
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
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
requireSession();
renderNavigation();
upgradeModals();
