(function () {
  const defaults = {
    dashboard: true, community: true, members: true, plans: true, memberships: true,
    pre_enrollments: true, finance: true, alerts: true, training: true,
    assessments: true, access: true, users: true
  };
  const storageKey = 'academiaEnabledModules';

  function normalize(value = {}) {
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, value[key] !== false]));
  }
  function cached() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch (_) { return normalize(); }
  }
  function store(modules) {
    const normalized = normalize(modules);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('academia:modules-changed', { detail: normalized }));
    return normalized;
  }
  async function load(token = localStorage.getItem('academiaToken') || localStorage.getItem('studentToken') || '') {
    if (!token) return cached();
    try {
      const response = await fetch('/api/gym/modules', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (response.ok) return store((await response.json()).modules);
    } catch (_) {}
    return cached();
  }
  window.AcademiaModules = { defaults, normalize, cached, store, load, isEnabled: (key) => cached()[key] !== false };
})();
