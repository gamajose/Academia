(function () {
  const root = document.documentElement;
  const page = String(window.location.pathname || '').split('/').pop() || '';
  const adminPages = new Set([
    'access.html',
    'account.html',
    'admin-community.html',
    'alerts.html',
    'alunos.html',
    'assessment-actions.html',
    'assessments.html',
    'exports.html',
    'financeiro.html',
    'home.html',
    'painel.html',
    'planos.html',
    'reports.html',
    'security.html',
    'settings.html',
    'solicitacoes.html',
    'student-report.html',
    'training.html',
    'users.html',
    'vinculos.html'
  ]);
  const studentPages = new Set([
    'student-access.html',
    'student-complete.html',
    'student-feed.html',
    'student-goals.html',
    'student-history.html',
    'student-portal.html',
    'student-profile.html',
    'student-progress.html',
    'student-security.html',
    'student-share.html',
    'student-social-profile-edit.html',
    'student-social-profile.html'
  ]);
  const isAdmin = adminPages.has(page);
  const isStudent = studentPages.has(page);
  if (!isAdmin && !isStudent) return;

  const resolveTheme = (preference) => preference === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  const preference = isAdmin
    ? (localStorage.getItem('adminTheme') || 'light')
    : (localStorage.getItem('studentTheme') || 'light');
  const theme = resolveTheme(['light', 'dark', 'system'].includes(preference) ? preference : 'light');

  root.classList.add('ui-booting');
  root.style.backgroundColor = theme === 'dark' ? '#091522' : '#eef5fb';
  root.style.colorScheme = theme;
  if (isAdmin) {
    root.dataset.adminShell = 'true';
    root.dataset.adminTheme = theme;
    root.dataset.adminAccent = localStorage.getItem('adminAccent') || 'blue';
  } else {
    root.dataset.studentTheme = theme;
    root.dataset.studentThemePreference = preference;
  }

  const guard = document.createElement('style');
  guard.id = 'ui-paint-guard';
  guard.textContent = 'html.ui-booting body{visibility:hidden!important}';
  document.head.appendChild(guard);

  if (isAdmin) {
    [
      './professional.css',
      './premium-ui.css',
      './blue-theme.css',
      './admin-nav-icons.css',
      './admin-mobile-nav.css?v=20260716-2',
      './admin-profile.css',
      './admin-dark-theme.css?v=20260715-1015',
      './admin-desktop-nav.css?v=20260716-1'
    ].forEach((href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.uiBootstrapStyle = 'true';
      link.addEventListener('load', () => { link.dataset.loaded = 'true'; }, { once: true });
      link.addEventListener('error', () => { link.dataset.loaded = 'error'; }, { once: true });
      document.head.appendChild(link);
    });
  }

  window.__uiBootFallback = window.setTimeout(() => {
    root.classList.remove('ui-booting');
  }, 4000);
}());
