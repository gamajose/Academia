const publicRoles = ['owner', 'admin'];

function isReadOnly(method) {
  return method === 'GET';
}

function accessProfile(user) {
  if (user.role === 'owner' || user.role === 'admin') return 'admin';
  if (user.role === 'operator') return 'operator';
  return user.access_profile || 'reception';
}

function commonStaffAccess(method, pathname) {
  const exactRead = [
    '/api/members', '/api/checkins/recent', '/api/dashboard/summary', '/api/me',
    '/api/gym/profile', '/api/alerts', '/api/classes', '/api/classes/sessions/upcoming',
    '/api/classes/session/roster', '/api/operations/live', '/api/operations/members',
    '/api/signups'
  ];
  if (isReadOnly(method) && exactRead.includes(pathname)) return true;
  if (pathname.startsWith('/api/members/detail') && (method === 'GET' || method === 'POST')) return true;
  if (method === 'POST' && ['/api/checkins', '/api/classes/sessions', '/api/classes/session/attendance', '/api/operations/manual-unlock'].includes(pathname)) return true;
  if (method === 'GET' && pathname === '/api/signups/check') return true;
  if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
  if (method === 'POST' && pathname === '/api/me/profile') return true;
  if (method === 'POST' && pathname === '/api/me/change-password') return true;
  return false;
}

function canAccess(user, method, pathname) {
  if (!user || !user.role) return false;
  if (publicRoles.includes(user.role)) return true;

  if (user.role === 'student') {
    if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
    return false;
  }

  const profile = accessProfile(user);
  if (user.role === 'staff') {
    if (commonStaffAccess(method, pathname)) return true;
    if (profile === 'trainer') {
      if (pathname.startsWith('/api/training') && (method === 'GET' || method === 'POST')) return true;
      if (pathname.startsWith('/api/assessments') && (method === 'GET' || method === 'POST')) return true;
      if (pathname.startsWith('/api/goals') && (method === 'GET' || method === 'POST')) return true;
    }
    return false;
  }

  if (user.role === 'operator') {
    return (method === 'GET' && ['/api/operations/live', '/api/operations/members'].includes(pathname))
      || (method === 'POST' && pathname === '/api/operations/manual-unlock');
  }

  return false;
}

module.exports = { canAccess, accessProfile };
