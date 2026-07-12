const publicRoles = ['owner', 'admin'];

function isReadOnly(method) {
  return method === 'GET';
}

function canAccess(user, method, pathname) {
  if (!user || !user.role) return false;
  if (publicRoles.includes(user.role)) return true;

  if (user.role === 'student') {
    if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
    return false;
  }

  if (user.role === 'staff') {
    const allowedExact = [
      '/api/members',
      '/api/members/workspace',
      '/api/checkins/recent',
      '/api/dashboard/summary',
      '/api/me',
      '/api/gym/profile',
      '/api/alerts',
      '/api/classes',
      '/api/classes/sessions/upcoming',
      '/api/classes/session/roster',
      '/api/operations/live',
      '/api/operations/members'
    ];
    if (isReadOnly(method) && allowedExact.includes(pathname)) return true;
    if (pathname === '/api/members/training-profile' && method === 'POST') return true;
    if (pathname === '/api/classes/sessions' && method === 'POST') return true;
    if (pathname === '/api/classes/session/attendance' && method === 'POST') return true;
    if (pathname === '/api/operations/manual-unlock' && method === 'POST') return true;
    if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
    if (pathname.startsWith('/api/training') && (method === 'GET' || method === 'POST')) return true;
    if (pathname.startsWith('/api/assessments') && (method === 'GET' || method === 'POST')) return true;
    if (pathname.startsWith('/api/goals') && (method === 'GET' || method === 'POST')) return true;
    if (method === 'POST' && pathname === '/api/checkins') return true;
    if (method === 'POST' && pathname === '/api/me/change-password') return true;
  }

  if (user.role === 'operator') {
    if (method === 'GET' && ['/api/operations/live', '/api/operations/members'].includes(pathname)) return true;
    if (method === 'POST' && pathname === '/api/operations/manual-unlock') return true;
  }

  return false;
}

module.exports = { canAccess };
