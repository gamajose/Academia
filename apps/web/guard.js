(() => {
  const token = localStorage.getItem('academiaToken') || '';
  const current = window.location.pathname.split('/').pop() || 'index.html';
  const publicPages = ['index.html', 'matricula-publica.html', 'student-login.html', 'home.html'];
  if (!token && !publicPages.includes(current)) {
    window.location.href = './admin.html';
  }
})();
