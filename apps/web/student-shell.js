(function () {
  const apiBase = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
  const token = localStorage.getItem('studentToken') || '';
  const navigationIcons = { home: '⌂', training: '▣', progress: '◔', goals: '◎', share: '↗', history: '◷' };

  function ensureStudentHomeLink() {
    const nav = document.querySelector('.student-module-nav');
    if (!nav || nav.querySelector('[data-student-link="home"]')) return;
    const link = document.createElement('a');
    link.dataset.studentLink = 'home';
    link.href = './student-home.html';
    link.textContent = 'Início';
    nav.prepend(link);
  }

  function createMobileNavigation() {
    if (document.querySelector('.student-mobile-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'student-mobile-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    const items = [
      ['home', './student-home.html', '⌂', 'Início'],
      ['training', './student-portal.html', '▣', 'Treino'],
      ['profile', './student-profile.html', '♙', 'Perfil']
    ];
    items.forEach(([key, href, iconText, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.dataset.mobileStudentLink = key;
      link.innerHTML = `<span class="nav-icon" aria-hidden="true">${iconText}</span><span class="nav-label">${label}</span>`;
      nav.appendChild(link);
    });
    document.body.appendChild(nav);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  async function api(path, options = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    return data;
  }

  function logout() {
    ['studentToken', 'studentName', 'studentAccountType', 'studentMustChangePassword'].forEach((key) => localStorage.removeItem(key));
    document.cookie = 'academiaStudentAuth=; Path=/; Max-Age=0; SameSite=Lax';
    window.location.href = './student-login.html';
  }

  function setActiveLink() {
    ensureStudentHomeLink();
    createMobileNavigation();
    const current = document.body.dataset.studentPage || 'training';
    document.querySelectorAll('[data-student-link]').forEach((link) => {
      link.classList.toggle('active', link.dataset.studentLink === current);
      const key = link.dataset.studentLink;
      if (!link.querySelector('.nav-icon') && navigationIcons[key]) {
        const icon = document.createElement('span');
        icon.className = 'nav-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = navigationIcons[key];
        const label = document.createElement('span');
        label.className = 'nav-label';
        label.textContent = link.textContent.trim();
        link.replaceChildren(icon, label);
      }
    });
    const mobileCurrent = current === 'security' || current === 'profile' ? 'profile' : current === 'home' ? 'home' : current === 'training' ? 'training' : '';
    document.querySelectorAll('[data-mobile-student-link]').forEach((link) => link.classList.toggle('active', link.dataset.mobileStudentLink === mobileCurrent));
  }

  async function init() {
    if (!token) {
      window.location.href = './student-login.html';
      return null;
    }
    setActiveLink();
    const trigger = document.getElementById('student-profile-trigger');
    const dropdown = document.getElementById('student-profile-dropdown');
    if (trigger && dropdown) {
      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = dropdown.classList.toggle('hidden');
        trigger.setAttribute('aria-expanded', String(!open));
      });
      document.addEventListener('click', () => dropdown.classList.add('hidden'));
    }
    document.getElementById('student-profile-logout')?.addEventListener('click', logout);

    try {
      const me = await api('/api/student/me');
      const name = me.name || localStorage.getItem('studentName') || 'Aluno';
      localStorage.setItem('studentName', name);
      document.querySelectorAll('[data-student-name]').forEach((element) => { element.textContent = name; });
      document.querySelectorAll('[data-student-avatar]').forEach((element) => { element.textContent = name.charAt(0).toUpperCase(); });
      document.querySelectorAll('[data-student-email]').forEach((element) => { element.textContent = me.account_email || me.email || ''; });
      return me;
    } catch (error) {
      if (error.message === 'nao_autorizado') logout();
      throw error;
    }
  }

  window.StudentPortal = { api, apiBase, token, escapeHtml, init, logout };
}());
