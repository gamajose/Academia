(function () {
  async function load() {
    try {
      const me = await StudentPortal.init();
      const name = (me?.name || 'Aluno').split(' ')[0];
      document.getElementById('student-home-title').textContent = `Olá, ${name}`;
      const detail = await StudentPortal.api('/api/student/training/current');
      document.getElementById('student-home-plan').textContent = detail.plan ? `${detail.plan.name} · ${detail.plan.goal || 'Treino personalizado'}` : 'Nenhuma ficha ativa no momento.';
    } catch (error) {
      document.getElementById('student-home-plan').textContent = `Não foi possível carregar a ficha: ${error.message}`;
    }
  }
  load();
}());
