(function () {
  const p = (id) => document.getElementById(id);
  const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  let detail;

  async function load() {
    try {
      await StudentPortal.init();
      detail = await StudentPortal.api('/api/student/training/current');
      const days = [...new Map((detail.exercises || []).map((item) => [item.workout_day_id, item])).values()];
      p('complete-day').innerHTML = days.map((item) => `<option value="${StudentPortal.escapeHtml(item.workout_day_id)}">${StudentPortal.escapeHtml(item.day_title || weekdays[(item.weekday || 1) - 1] || 'Treino')}</option>`).join('');
      const today = (new Date().getDay() || 7).toString();
      const todayExercise = days.find((item) => String(item.weekday) === today);
      if (todayExercise) p('complete-day').value = todayExercise.workout_day_id;
      p('student-complete-status').textContent = 'Escolha o treino realizado e registre a sessão.';
    } catch (error) { p('student-complete-status').textContent = `Erro: ${error.message}`; }
  }

  p('portal-complete-button').addEventListener('click', async () => {
    const button = p('portal-complete-button');
    try {
      button.disabled = true;
      await StudentPortal.api('/api/student/training/complete', { method: 'POST', body: JSON.stringify({ plan_id: detail.plan.id, workout_day_id: p('complete-day').value, perceived_effort: Number(p('portal-effort').value || 0) || null, feedback: p('portal-feedback').value.trim() }) });
      p('portal-effort').value = ''; p('portal-feedback').value = '';
      p('student-complete-status').textContent = 'Treino concluído e salvo no seu histórico.';
    } catch (error) { p('student-complete-status').textContent = `Erro: ${error.message}`; } finally { button.disabled = false; }
  });
  load();
}());
