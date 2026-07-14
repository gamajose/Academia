(function () {
  const apiBase = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
  function getCookie(name) {
    const entry = document.cookie.split('; ').find((value) => value.startsWith(`${name}=`));
    if (!entry) return '';
    const value = entry.slice(name.length + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function getToken() {
    return localStorage.getItem('studentToken') || localStorage.getItem('academiaStudentToken') || getCookie('academiaStudentAuth') || '';
  }
  const navigationIcons = { community: 'users', training: 'dumbbell', progress: 'chart', goals: 'target', share: 'upload', history: 'history', access: 'qr' };
  const navigationLabels = { community: 'Comunidade', training: 'Treino', progress: 'Evolução', goals: 'Metas', share: 'Compartilhar', history: 'Histórico', access: 'Acesso' };
  const translations = {
    en: {
      'Comunidade': 'Community', 'Treino': 'Workout', 'Evolução': 'Progress', 'Metas': 'Goals', 'Compartilhar': 'Share', 'Histórico': 'History', 'Acesso': 'Access', 'Perfil': 'Profile', 'Minha conta': 'My account', 'Meu perfil': 'My profile', 'Sair': 'Sign out',
      'Editar perfil': 'Edit profile', 'Conta': 'Account', 'Dados da conta': 'Account details', 'Segurança': 'Security', 'Preferências': 'Preferences', 'Idioma': 'Language', 'Tema': 'Theme', 'Exportar dados': 'Export data', 'Foto visível no seu perfil': 'Profile photo', 'Nome': 'Name', 'Bio': 'Bio', 'Link': 'Link', 'Deixar meu perfil privado': 'Make my profile private', 'Em um perfil privado, somente seguidores aprovados veem suas publicações.': 'On a private profile, only approved followers can see your posts.', 'Salvar alterações': 'Save changes', 'Cancelar': 'Cancel', 'Dados pessoais': 'Personal details', 'Contato': 'Contact', 'Endereço': 'Address', 'Sobre você': 'About you', 'Nome completo': 'Full name', 'Data de nascimento': 'Date of birth', 'CPF': 'Tax ID', 'RG': 'ID document', 'E-mail': 'Email', 'Telefone': 'Phone', 'Rua': 'Street', 'Número': 'Number', 'Bairro': 'Neighborhood', 'Cidade': 'City', 'Estado': 'State', 'Objetivo': 'Goal', 'Alergias e restrições': 'Allergies and restrictions', 'Observações': 'Notes', 'Salvar preferências': 'Save preferences', 'Salvar idioma': 'Save language', 'Salvar tema': 'Save theme', 'O idioma escolhido será aplicado à interface do aluno.': 'The selected language will be applied to the student interface.', 'A aparência será aplicada imediatamente e mantida nas próximas telas.': 'The appearance is applied immediately and kept on future screens.', 'Trocar senha': 'Change password', 'Senha atual': 'Current password', 'Nova senha': 'New password', 'Confirmar nova senha': 'Confirm new password', 'Atualizar senha': 'Update password', 'Português': 'Portuguese', 'Inglês': 'English', 'Espanhol': 'Spanish', 'Español': 'Spanish', 'Claro': 'Light', 'Escuro': 'Dark', 'Automático': 'System'
    },
    es: {
      'Comunidade': 'Comunidad', 'Treino': 'Entrenamiento', 'Evolução': 'Progreso', 'Metas': 'Metas', 'Compartilhar': 'Compartir', 'Histórico': 'Historial', 'Acesso': 'Acceso', 'Perfil': 'Perfil', 'Minha conta': 'Mi cuenta', 'Meu perfil': 'Mi perfil', 'Sair': 'Cerrar sesión',
      'Editar perfil': 'Editar perfil', 'Conta': 'Cuenta', 'Dados da conta': 'Datos de la cuenta', 'Segurança': 'Seguridad', 'Preferências': 'Preferencias', 'Idioma': 'Idioma', 'Tema': 'Tema', 'Exportar dados': 'Exportar datos', 'Foto visível no seu perfil': 'Foto visible en tu perfil', 'Nome': 'Nombre', 'Bio': 'Biografía', 'Link': 'Enlace', 'Deixar meu perfil privado': 'Hacer mi perfil privado', 'Em um perfil privado, somente seguidores aprovados veem suas publicações.': 'En un perfil privado, solo los seguidores aprobados ven tus publicaciones.', 'Salvar alterações': 'Guardar cambios', 'Cancelar': 'Cancelar', 'Dados pessoais': 'Datos personales', 'Contato': 'Contacto', 'Endereço': 'Dirección', 'Sobre você': 'Sobre ti', 'Nome completo': 'Nombre completo', 'Data de nascimento': 'Fecha de nacimiento', 'CPF': 'Documento fiscal', 'RG': 'Documento de identidad', 'E-mail': 'Correo electrónico', 'Telefone': 'Teléfono', 'Rua': 'Calle', 'Número': 'Número', 'Bairro': 'Barrio', 'Cidade': 'Ciudad', 'Estado': 'Estado', 'Objetivo': 'Objetivo', 'Alergias e restrições': 'Alergias y restricciones', 'Observações': 'Observaciones', 'Salvar preferências': 'Guardar preferencias', 'Salvar idioma': 'Guardar idioma', 'Salvar tema': 'Guardar tema', 'O idioma escolhido será aplicado à interface do aluno.': 'El idioma elegido se aplicará a la interfaz del alumno.', 'A aparência será aplicada imediatamente e mantida nas próximas telas.': 'La apariencia se aplica inmediatamente y se mantiene en las próximas pantallas.', 'Trocar senha': 'Cambiar contraseña', 'Senha atual': 'Contraseña actual', 'Nova senha': 'Nueva contraseña', 'Confirmar nova senha': 'Confirmar nueva contraseña', 'Atualizar senha': 'Actualizar contraseña', 'Português': 'Portugués', 'Inglês': 'Inglés', 'Espanhol': 'Español', 'Español': 'Español', 'Claro': 'Claro', 'Escuro': 'Oscuro', 'Automático': 'Sistema'
    }
  };
  const validThemes = ['light', 'dark', 'system'];

  function getLocale() { return ['pt-BR', 'en', 'es'].includes(localStorage.getItem('studentLanguage')) ? localStorage.getItem('studentLanguage') : 'pt-BR'; }

  function translatePage() {
    const locale = getLocale();
    document.documentElement.lang = locale;
    const dictionary = translations[locale === 'pt-BR' ? '' : locale] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement?.matches('script,style,textarea,input')) continue;
      const original = node.nodeValue.trim();
      const source = Object.keys(translations.en).find((key) => translations.en[key] === original) || Object.keys(translations.es).find((key) => translations.es[key] === original) || original;
      const translated = dictionary[source] || source;
      const leading = node.nodeValue.match(/^\s*/)?.[0] || '';
      const trailing = node.nodeValue.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${translated}${trailing}`;
    }
  }

  function setLocale(locale) {
    const next = ['pt-BR', 'en', 'es'].includes(locale) ? locale : 'pt-BR';
    localStorage.setItem('studentLanguage', next);
    translatePage();
  }

  function applyTheme(theme) {
    const preference = validThemes.includes(theme) ? theme : 'light';
    const effective = preference === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.studentTheme = effective;
    document.documentElement.dataset.studentThemePreference = preference;
    localStorage.setItem('studentTheme', preference);
  }

  applyTheme(localStorage.getItem('studentTheme') || 'light');

  function iconSvg(name) {
    const paths = {
      dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11M3 9h3.5v6H3zM17.5 9H21v6h-3.5z"/>',
      chart: '<path d="M4 19V5M4 19h16M8 15v-3M12 15V8M16 15v-6"/>',
      target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
      upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/>',
      history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/>',
      profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
      users: '<path d="M16 20v-1.5a4.5 4.5 0 0 0-9 0V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 11a2.8 2.8 0 0 0-1.8-5.2M19.5 20v-1a3.7 3.7 0 0 0-2.8-3.6"/>',
      qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/>'
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
      ['access', './student-access.html', 'qr', 'Acesso'],
      ['profile', './student-social-profile.html', 'profile', 'Perfil']
    ];
    items.forEach(([key, href, iconText, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.dataset.mobileStudentLink = key;
      link.innerHTML = `<span class="nav-icon">${iconSvg(iconText)}</span><span class="nav-label">${translations[getLocale()]?.[label] || label}</span>`;
      nav.appendChild(link);
    });
    document.body.appendChild(nav);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${apiBase}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'erro_requisicao');
    return data;
  }

  function logout() {
    ['studentToken', 'academiaStudentToken', 'studentName', 'studentAccountType', 'studentMustChangePassword'].forEach((key) => localStorage.removeItem(key));
    document.cookie = 'academiaStudentAuth=; Path=/; Max-Age=0; SameSite=Lax';
    window.location.href = './student-login.html';
  }

  function setActiveLink() {
    createMobileNavigation();
    const desktopNav = document.querySelector('.student-module-nav');
    document.querySelectorAll('[data-student-link="history"]').forEach((link) => {
      link.dataset.studentLink = 'access';
      link.href = './student-access.html';
      link.textContent = 'Acesso';
    });
    if (desktopNav && !desktopNav.querySelector('[data-student-link="community"]')) {
      const community = document.createElement('a');
      community.dataset.studentLink = 'community';
      community.href = './student-feed.html';
      community.textContent = translations[getLocale()]?.Comunidade || 'Comunidade';
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
        label.textContent = translations[getLocale()]?.[navigationLabels[key]] || navigationLabels[key] || link.textContent.trim();
        link.replaceChildren(icon, label);
      } else if (link.querySelector('.nav-label') && navigationLabels[key]) {
        link.querySelector('.nav-label').textContent = translations[getLocale()]?.[navigationLabels[key]] || navigationLabels[key];
      }
    });
    const mobileCurrent = current === 'security' || current === 'profile' ? 'profile' : current === 'progress' ? 'progress' : current === 'community' ? 'community' : current === 'access' ? 'access' : 'training';
    document.querySelectorAll('[data-mobile-student-link]').forEach((link) => link.classList.toggle('active', link.dataset.mobileStudentLink === mobileCurrent));
  }

  async function init() {
    const token = getToken();
    if (!token) {
      window.location.href = './student-login.html';
      return null;
    }
    if (!localStorage.getItem('studentToken')) localStorage.setItem('studentToken', token);
    setActiveLink();
    translatePage();
    const trigger = document.getElementById('student-profile-trigger');
    const dropdown = document.getElementById('student-profile-dropdown');
    document.querySelectorAll('.profile-dropdown a').forEach((link) => {
      if (['Meu perfil', 'My profile', 'Mi perfil'].includes(link.textContent.trim())) link.href = './student-social-profile.html';
      if (['Segurança', 'Security', 'Seguridad'].includes(link.textContent.trim())) link.href = './student-social-profile-edit.html#social-security';
    });
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

  window.StudentPortal = { api, apiBase, getToken, escapeHtml, init, logout, getLocale, setLocale, applyTheme };
}());
