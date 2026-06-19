function runAutoSync() {
  const token = localStorage.getItem('academiaToken') || '';
  if (!token) return;
  const ids = [
    'load-button',
    'refresh-users-button',
    'refresh-student-accounts-button',
    'reload-actions-button',
    'refresh-alerts-button',
    'refresh-assessments-button',
    'refresh-training-button'
  ];
  for (const id of ids) {
    const button = document.getElementById(id);
    if (button && !button.disabled) {
      button.click();
      return;
    }
  }
}

window.addEventListener('load', () => {
  setInterval(runAutoSync, 30000);
});
