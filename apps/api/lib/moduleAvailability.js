const DEFAULT_MODULES = Object.freeze({
  dashboard: true,
  community: true,
  members: true,
  plans: true,
  memberships: true,
  pre_enrollments: true,
  finance: true,
  alerts: true,
  training: true,
  assessments: true,
  access: true,
  users: true
});

function normalizeModules(value = {}) {
  return Object.fromEntries(Object.keys(DEFAULT_MODULES).map((key) => [key, value[key] !== false]));
}

function moduleForRequest(pathname) {
  if (pathname.startsWith('/api/dashboard')) return 'dashboard';
  if (pathname.startsWith('/api/student/social') || pathname.startsWith('/api/student/admin-community') || pathname.startsWith('/api/student/feed') || pathname.startsWith('/api/community')) return 'community';
  if (pathname.startsWith('/api/users') || pathname.startsWith('/api/access-profiles')) return 'users';
  if (pathname.startsWith('/api/student/access') || pathname.startsWith('/api/access') || pathname.startsWith('/api/checkins') || pathname.startsWith('/api/operations')) return 'access';
  if (pathname.startsWith('/api/student/training') || pathname.startsWith('/api/student/workout') || pathname.startsWith('/api/training')) return 'training';
  if (pathname.startsWith('/api/student/progress') || pathname.startsWith('/api/student/goals') || pathname.startsWith('/api/assessments') || pathname.startsWith('/api/goals')) return 'assessments';
  if (pathname.startsWith('/api/memberships')) return 'memberships';
  if (pathname.startsWith('/api/signups')) return 'pre_enrollments';
  if (pathname.startsWith('/api/finance') || pathname.startsWith('/api/sales')) return 'finance';
  if (pathname.startsWith('/api/alerts') || pathname.startsWith('/api/notifications')) return 'alerts';
  if (pathname.startsWith('/api/plans')) return 'plans';
  if (pathname.startsWith('/api/members')) return 'members';
  return null;
}

async function loadEnabledModules(query, gymId) {
  const result = await query('SELECT enabled_modules FROM gyms WHERE id = $1 LIMIT 1', [gymId]);
  return normalizeModules(result.rows[0]?.enabled_modules || {});
}

module.exports = { DEFAULT_MODULES, normalizeModules, moduleForRequest, loadEnabledModules };
