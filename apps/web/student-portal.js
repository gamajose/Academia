(function () {
  const p = (id) => document.getElementById(id);
  const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  let detail = null;
  let selectedWeekday = new Date().getDay() || 7;

  function makeEntity(title, subtitle, extra) {
    const row = document.createElement('li');
    row.className = 'entity-card';
    const main = document.createElement('div');
    main.className = 'entity-main';
    main.innerHTML = `<strong>${StudentPortal.escapeHtml(title)}</strong><span>${StudentPortal.escapeHtml(subtitle)}</span>${extra ? `<span>${StudentPortal.escapeHtml(extra)}</span>` : ''}`;
    row.appendChild(main);
    return row;
  }

  function renderDayPicker(exercises) {
    const picker = p('student-day-picker');
    picker.innerHTML = '';
    const days = [...new Set(exercises.map((item) => Number(item.weekday)).filter((day) => day >= 1 && day <= 7))];
    (days.length ? days : [selectedWeekday]).sort((a, b) => a - b).forEach((day) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = day === selectedWeekday ? 'active' : '';
      button.textContent = weekdays[day - 1] || `Dia ${day}`;
      button.addEventListener('click', () => { selectedWeekday = day; renderDayPicker(exercises); renderExercises(exercises); });
      picker.appendChild(button);
    });
  }

  function renderExercises(exercises) {
    const list = p('portal-exercise-list');
    const current = exercises.filter((item) => Number(item.weekday) === selectedWeekday);
    const fallback = current.length ? current : exercises;
    list.innerHTML = '';
    p('student-day-title').textContent = `${weekdays[selectedWeekday - 1] || 'Treino'} · exercícios`;
    fallback.forEach((item) => {
      const row = makeEntity(
        item.exercise_name || 'Exercício',
        `${item.sets || '-'} séries · ${item.reps || '-'} repetições · ${item.rest_seconds || '-'}s de descanso`,
        [item.muscle_group_primary || item.muscle_group, item.instructions].filter(Boolean).join(' · ')
      );
      if (item.video_url && window.AcademiaTrainingMedia) {
        const media = document.createElement('div');
        media.className = 'video-preview-slot';
        window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
        row.appendChild(media);
      }
      list.appendChild(row);
    });
    if (!fallback.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhum exercício cadastrado para este dia.';
      list.appendChild(empty);
    }
  }

  async function load() {
    try {
      await StudentPortal.init();
      const me = await StudentPortal.api('/api/student/me');
      const firstName = (me.name || 'Aluno').split(' ')[0];
      p('student-portal-title').textContent = `Meu treino, ${firstName}`;
      detail = await StudentPortal.api('/api/student/training/current');
      const exercises = detail.exercises || [];
      if (!exercises.some((item) => Number(item.weekday) === selectedWeekday)) selectedWeekday = Number(exercises[0]?.weekday) || selectedWeekday;
      p('student-portal-meta').textContent = `Ficha: ${detail.plan?.name || '-'} · Nível: ${detail.plan?.level || '-'} · Objetivo: ${detail.plan?.goal || '-'} · ${detail.plan?.age_days || 0} dias`;
      renderDayPicker(exercises);
      renderExercises(exercises);
      p('student-auto-sync').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
      p('student-portal-status').textContent = 'Treino pronto para hoje.';
    } catch (error) {
      p('student-portal-status').textContent = `Erro: ${error.message}`;
    }
  }

  window.StudentWorkout = { getDetail: () => detail };
  load();
}());
