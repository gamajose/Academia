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
      '/api/checkins/recent',
      '/api/dashboard/summary',
      '/api/me',
      '/api/gym/profile'
    ];
    if (isReadOnly(method) && allowedExact.includes(pathname)) return true;
    if (pathname.startsWith('/api/student') && (method === 'GET' || method === 'POST')) return true;
    if (pathname.startsWith('/api/training') && (method === 'GET' || method === 'POST')) return true;
    if (method === 'POST' && pathname === '/api/checkins') return true;
    if (method === 'POST' && pathname === '/api/me/change-password') return true;
  }

  return false;
}

module.exports = { canAccess };
