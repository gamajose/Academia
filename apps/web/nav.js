function loadNavigationStyles() {
  if (document.querySelector('link[href="./professional.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './professional.css';
  document.head.appendChild(link);
}

function renderNavigation() {
  loadNavigationStyles();
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const pages = [
    ['home.html', 'Inicio'],
    ['index.html', 'Painel'],
    ['training.html', 'Treinos'],
    ['assessments.html', 'Avaliacao'],
    ['student-accounts.html', 'Acesso aluno'],
    ['users.html', 'Usuarios'],
    ['account.html', 'Conta'],
    ['reports.html', 'Relatorios'],
    ['exports.html', 'Exportacoes'],
    ['audit.html', 'Auditoria'],
    ['settings.html', 'Configuracoes']
  ];

  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `
    <div class="top-nav-brand">
      <strong>Academia Platform</strong>
      <span>gestao completa</span>
    </div>
    <div class="top-nav-links">
      ${pages.map(([href, label]) => `<a class="${current === href ? 'active' : ''}" href="./${href}">${label}</a>`).join('')}
    </div>
  `;
  document.body.prepend(nav);
}

function requireSession() {
  const publicPages = ['home.html'];
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const token = localStorage.getItem('academiaToken') || '';
  if (!token && !publicPages.includes(current) && current !== 'index.html') {
    window.location.href = './index.html';
  }
}

renderNavigation();
requireSession();
