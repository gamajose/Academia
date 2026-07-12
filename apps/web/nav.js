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
}

function clearSession() {
  localStorage.removeItem('academiaToken');
  localStorage.removeItem('academiaUserName');
  localStorage.removeItem('academiaRole');
  document.cookie = 'academiaAuth=; Path=/; Max-Age=0; SameSite=Lax';
  window.location.href = './student-login.html';
}

function roleLabel(role) {
  return ({ owner: 'Proprietário', admin: 'Administrador', staff: 'Professor', operator: 'Operação' })[role] || 'Usuário';
}

function renderNavigation() {
  loadNavigationStyles();
  const current = window.location.pathname.split('/').pop() || 'painel.html';
  const pages = [
    ['painel.html', 'Painel'], ['alunos.html', 'Alunos'], ['planos.html', 'Planos'],
    ['vinculos.html', 'Matrículas'], ['solicitacoes.html', 'Pré-matrículas'],
    ['financeiro.html', 'Financeiro'], ['alerts.html', 'Alertas'], ['training.html', 'Treinos'],
    ['assessments.html', 'Avaliações'], ['student-accounts.html', 'Acesso'], ['users.html', 'Usuários']
  ];

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <div class="top-nav-brand"><strong>Academia Lobo</strong><span>gestão da academia</span></div>
    <div class="top-nav-links">${pages.map(([href, label]) => `<a class="${current === href ? 'active' : ''}" href="./${href}">${label}</a>`).join('')}</div>
    <div class="profile-menu">
      <button class="profile-trigger" id="profile-trigger" type="button" aria-expanded="false">
        <span class="profile-avatar" id="profile-avatar">U</span>
        <span class="profile-copy"><strong id="profile-name">Minha conta</strong><span id="profile-role">Usuário</span></span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div class="profile-dropdown hidden" id="profile-dropdown">
        <a href="./account.html">Perfil</a>
        <a href="./settings.html">Configurações</a>
        <a href="./account.html#security">Segurança</a>
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
    localStorage.setItem('academiaUserName', user.name || '');
    localStorage.setItem('academiaRole', user.role || '');
    const name = user.name || 'Minha conta';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = roleLabel(user.role);
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
    const accountName = document.getElementById('account-name');
    const accountRole = document.getElementById('account-role');
    if (accountName) accountName.textContent = name;
    if (accountRole) accountRole.textContent = `${roleLabel(user.role)} · permissoes definidas pelo cargo`;
  } catch (_) {
    const name = localStorage.getItem('academiaUserName') || 'Minha conta';
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = roleLabel(localStorage.getItem('academiaRole'));
    document.getElementById('profile-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
    const accountName = document.getElementById('account-name');
    const accountRole = document.getElementById('account-role');
    if (accountName) accountName.textContent = name;
    if (accountRole) accountRole.textContent = roleLabel(localStorage.getItem('academiaRole'));
  }
}

function requireSession() {
  const publicPages = ['home.html', 'index.html', 'plans.html', 'matricula-publica.html', 'student-login.html', 'admin.html'];
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const token = localStorage.getItem('academiaToken') || '';
  if (!token && !publicPages.includes(current)) window.location.href = './student-login.html';
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
