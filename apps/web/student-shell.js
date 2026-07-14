(function () {
  const apiBase = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
  const token = localStorage.getItem('studentToken') || '';
  const navigationIcons = { community: 'users', training: 'dumbbell', progress: 'chart', goals: 'target', share: 'upload', history: 'history' };
  const navigationLabels = { community: 'Comunidade', training: 'Treino', progress: 'Evolução', goals: 'Metas', share: 'Compartilhar', history: 'Histórico' };

  function iconSvg(name) {
    const paths = {
      dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11M3 9h3.5v6H3zM17.5 9H21v6h-3.5z"/>',
      chart: '<path d="M4 19V5M4 19h16M8 15v-3M12 15V8M16 15v-6"/>',
      target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
      upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/>',
      history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/>',
      profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
      users: '<path d="M16 20v-1.5a4.5 4.5 0 0 0-9 0V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 11a2.8 2.8 0 0 0-1.8-5.2M19.5 20v-1a3.7 3.7 0 0 0-2.8-3.6"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.target}</svg>`;
  }

  function createMobileNavigation() {
    if (document.querySelector('.student-mobile-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'student-mobile-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    const items = [
      ['community', './student-feed.html', 'users', 'Comunidade'],
      ['training', './student-portal.html', 'dumbbell', 'Treino'],
      ['progress', './student-progress.html', 'chart', 'Evolução'],
      ['profile', './student-profile.html', 'profile', 'Perfil']
    ];
    items.forEach(([key, href, iconText, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.dataset.mobileStudentLink = key;
      link.innerHTML = `<span class="nav-icon">${iconSvg(iconText)}</span><span class="nav-label">${label}</span>`;
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
    createMobileNavigation();
    const desktopNav = document.querySelector('.student-module-nav');
    if (desktopNav && !desktopNav.querySelector('[data-student-link="community"]')) {
      const community = document.createElement('a');
      community.dataset.studentLink = 'community';
      community.href = './student-feed.html';
      community.textContent = 'Comunidade';
      desktopNav.insertBefore(community, desktopNav.firstElementChild);
    }
    const current = document.body.dataset.studentPage || 'training';
    document.querySelectorAll('[data-student-link]').forEach((link) => {
      link.classList.toggle('active', link.dataset.studentLink === current);
      const key = link.dataset.studentLink;
      if (!link.querySelector('.nav-icon') && navigationIcons[key]) {
        const icon = document.createElement('span');
        icon.className = 'nav-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = iconSvg(navigationIcons[key]);
        const label = document.createElement('span');
        label.className = 'nav-label';
        label.textContent = navigationLabels[key] || link.textContent.trim();
        link.replaceChildren(icon, label);
      } else if (link.querySelector('.nav-label') && navigationLabels[key]) {
        link.querySelector('.nav-label').textContent = navigationLabels[key];
      }
    });
    const mobileCurrent = current === 'security' || current === 'profile' ? 'profile' : current === 'progress' ? 'progress' : current === 'community' ? 'community' : 'training';
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
