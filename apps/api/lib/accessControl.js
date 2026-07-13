const publicRoles = ['owner', 'admin'];

const ALL_MODULE_PERMISSIONS = {
  dashboard: true, members: true, plans: true, memberships: true, pre_enrollments: true,
  finance: true, alerts: true, training: true, assessments: true, student_access: true,
  users: true, account: true, reports: true, access: true, classes: true, settings: true,
  audit: true, exports: true
};

function isReadOnly(method) {
  return method === 'GET';
}

function accessProfile(user) {
  if (user.role === 'owner' || user.role === 'admin') return 'admin';
  if (user.role === 'operator') return 'operator';
  return user.access_profile || 'reception';
}

function moduleForPath(pathname) {
  if (pathname === '/api/me' || pathname.startsWith('/api/me/')) return 'account';
  if (pathname.startsWith('/api/dashboard')) return 'dashboard';
  if (pathname.startsWith('/api/members')) return 'members';
  if (pathname.startsWith('/api/plans')) return 'plans';
  if (pathname.startsWith('/api/memberships')) return 'memberships';
  if (pathname.startsWith('/api/signups')) return 'pre_enrollments';
  if (pathname.startsWith('/api/finance') || pathname.startsWith('/api/sales')) return 'finance';
  if (pathname.startsWith('/api/alerts')) return 'alerts';
  if (pathname.startsWith('/api/notifications')) return 'alerts';
  if (pathname.startsWith('/api/checkins')) return 'access';
  if (pathname.startsWith('/api/training') || pathname.startsWith('/api/goals')) return 'training';
  if (pathname.startsWith('/api/assessments')) return 'assessments';
  if (pathname.startsWith('/api/student')) return 'student_access';
  if (pathname.startsWith('/api/users') || pathname.startsWith('/api/access-profiles')) return 'users';
  if (pathname.startsWith('/api/reports')) return 'reports';
  if (pathname.startsWith('/api/operations') || pathname.startsWith('/api/access')) return 'access';
  if (pathname.startsWith('/api/classes')) return 'classes';
  if (pathname.startsWith('/api/gym')) return 'settings';
  if (pathname.startsWith('/api/audit')) return 'audit';
  if (pathname.startsWith('/api/exports')) return 'exports';
  return null;
}

function commonStaffAccess(method, pathname, permissions = null) {
  const exactRead = [
    '/api/members', '/api/checkins/recent', '/api/dashboard/summary', '/api/me',
    '/api/gym/profile', '/api/alerts', '/api/classes', '/api/classes/sessions/upcoming',
    '/api/classes/session/roster', '/api/operations/live', '/api/operations/members',
    '/api/signups'
  ];
  const module = moduleForPath(pathname);
  if (permissions && module && permissions[module] === true) return true;
  if (isReadOnly(method) && exactRead.includes(pathname)) return true;
  if (pathname.startsWith('/api/members/detail') && (method === 'GET' || method === 'POST')) return true;
  if (method === 'POST' && ['/api/checkins', '/api/classes/sessions', '/api/classes/session/attendance', '/api/operations/manual-unlock'].includes(pathname)) return true;
  if (method === 'GET' && pathname === '/api/signups/check') return true;
  if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
  if (method === 'POST' && pathname === '/api/me/profile') return true;
  if (method === 'POST' && pathname === '/api/me/change-password') return true;
  return false;
}

function canAccess(user, method, pathname, permissions = null) {
  if (!user || !user.role) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'admin' && pathname.startsWith('/api/access-profiles')) return true;
  if (publicRoles.includes(user.role) && !permissions) return true;

  if (user.role === 'student') {
    if (pathname === '/api/editor/images' && method === 'POST') return true;
    if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
    return false;
  }

  if (user.role === 'visitor') {
    return method === 'GET' && pathname === '/api/student/visitor/me';
  }

  if (user.role === 'admin') {
    return !permissions || permissions[moduleForPath(pathname)] === true;
  }

  const profile = accessProfile(user);
  if (user.role === 'staff') {
    if (commonStaffAccess(method, pathname, permissions)) return true;
    if (permissions) return false;
    if (profile === 'trainer') {
      if (pathname.startsWith('/api/training') && (method === 'GET' || method === 'POST')) return true;
      if (pathname.startsWith('/api/assessments') && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
      if (pathname.startsWith('/api/goals') && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
    }
    return false;
  }

  if (user.role === 'operator') {
    if (permissions && permissions[moduleForPath(pathname)] === true) return true;
    if (permissions) return false;
    return (method === 'GET' && ['/api/operations/live', '/api/operations/members'].includes(pathname))
      || (method === 'POST' && pathname === '/api/operations/manual-unlock');
  }

  return false;
}

async function touchUserActivity(query, user) {
  if (!user?.sub || !user?.gym_id) return;
  try {
    await query(
      `UPDATE users
       SET last_seen_at = now()
       WHERE id = $1 AND gym_id = $2
         AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute')`,
      [user.sub, user.gym_id]
    );
  } catch (_) {
    // Mantém a autorização funcionando durante deploys em que a migration ainda não terminou.
  }
}

async function loadAccessPermissions(query, user) {
  if (!user) return null;
  await touchUserActivity(query, user);
  if (user.role === 'owner') return ALL_MODULE_PERMISSIONS;
  try {
    const result = await query('SELECT permissions FROM access_profiles WHERE gym_id = $1 AND slug = $2 AND is_active = true LIMIT 1', [user.gym_id, accessProfile(user)]);
    return result.rows[0]?.permissions || null;
  } catch (_) {
    return null;
  }
}

function hasModulePermission(user, module, permissions = user?.access_permissions) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  if (permissions && Object.prototype.hasOwnProperty.call(permissions, module)) return permissions[module] === true;
  if (user.role === 'admin') return true;
  if (user.role === 'operator') return module === 'access' || module === 'dashboard' || module === 'student_access' || module === 'account';
  return accessProfile(user) === 'trainer' ? ['dashboard', 'members', 'training', 'assessments', 'student_access', 'account'].includes(module) : ['dashboard', 'members', 'memberships', 'pre_enrollments', 'alerts', 'student_access', 'account'].includes(module);
}

module.exports = { ALL_MODULE_PERMISSIONS, canAccess, accessProfile, hasModulePermission, loadAccessPermissions, moduleForPath };
