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
    ['index.html', 'Site'],
    ['painel.html', 'Painel'],
    ['alunos.html', 'Alunos'],
    ['planos.html', 'Planos'],
    ['vinculos.html', 'Matrículas'],
    ['financeiro.html', 'Financeiro'],
    ['alerts.html', 'Alertas'],
    ['training.html', 'Treinos'],
    ['assessments.html', 'Avaliacao'],
    ['student-accounts.html', 'Acesso aluno'],
    ['users.html', 'Usuarios'],
    ['account.html', 'Conta']
  ];
  const nav = document.createElement('nav');
  nav.className = 'top-nav';
  nav.innerHTML = `<div class="top-nav-brand"><strong>Academia Platform</strong><span>gestao completa</span></div><div class="top-nav-links">${pages.map(([href, label]) => `<a class="${current === href ? 'active' : ''}" href="./${href}">${label}</a>`).join('')}</div>`;
  document.body.prepend(nav);
}

function requireSession() {
  const publicPages = ['home.html', 'index.html', 'matricula-publica.html', 'student-login.html', 'admin.html'];
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const token = localStorage.getItem('academiaToken') || '';
  if (!token && !publicPages.includes(current)) window.location.href = './admin.html';
}

renderNavigation();
requireSession();
