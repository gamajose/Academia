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

  function openExercise(item) {
    p('student-exercise-title').textContent = item.exercise_name || 'Exercício';
    p('student-exercise-subtitle').textContent = [item.day_title, item.muscle_group].filter(Boolean).join(' · ') || 'Demonstração e orientações';
    p('student-exercise-sets').textContent = item.sets || '-';
    p('student-exercise-reps').textContent = item.reps || '-';
    p('student-exercise-rest').textContent = item.rest_seconds ? `${item.rest_seconds}s` : '-';
    p('student-exercise-equipment').textContent = item.equipment || '-';
    p('student-exercise-primary').textContent = item.muscle_group_primary || item.muscle_group || '-';
    p('student-exercise-secondary').textContent = item.muscle_group_secondary || '-';
    p('student-exercise-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada.';
    const media = p('student-exercise-media');
    media.replaceChildren();
    if (item.video_url && window.AcademiaTrainingMedia) {
      window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
    } else {
      const empty = document.createElement('span');
      empty.className = 'exercise-view-media-empty';
      empty.textContent = 'Nenhuma demonstração cadastrada.';
      media.appendChild(empty);
    }
    p('student-exercise-modal').classList.remove('hidden');
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
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Ver detalhes de ${item.exercise_name || 'exercício'}`);
      row.addEventListener('click', () => openExercise(item));
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openExercise(item); } });
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
    } catch (error) {
      p('student-portal-status').textContent = `Erro: ${error.message}`;
    }
  }

  window.StudentWorkout = { getDetail: () => detail };
  p('student-exercise-close').addEventListener('click', () => p('student-exercise-modal').classList.add('hidden'));
  p('student-exercise-modal').addEventListener('click', (event) => { if (event.target === p('student-exercise-modal')) p('student-exercise-modal').classList.add('hidden'); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') p('student-exercise-modal').classList.add('hidden'); });
  load();
}());
