(function () {
  const p = (id) => document.getElementById(id);
  const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  let detail = null;
  let catalog = { public: [], private: [] };
  let selectedWeekday = new Date().getDay() || 7;
  let editingExerciseId = null;

  function dayFor(weekday = selectedWeekday) {
    return (detail?.days || []).find((day) => Number(day.weekday) === Number(weekday)) || { weekday, title: weekdays[weekday - 1] };
  }

  function exercisesFor(weekday = selectedWeekday) {
    const day = dayFor(weekday);
    return (detail?.exercises || []).filter((item) => String(item.workout_day_id) === String(day.id) || Number(item.weekday) === Number(weekday));
  }

  function setStatus(id, message, error = false) {
    const element = p(id);
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('error', Boolean(error));
  }

  function makeEntity(item) {
    const row = document.createElement('li');
    row.className = 'entity-card student-workout-exercise-row';
    const main = document.createElement('div');
    main.className = 'entity-main';
    const title = document.createElement('strong');
    title.textContent = item.exercise_name || 'Exercício';
    const details = document.createElement('span');
    details.textContent = `${item.sets || '-'} séries · ${item.reps || '-'} repetições · ${item.rest_seconds || '-'}s de descanso`;
    const extra = document.createElement('span');
    extra.textContent = [item.is_private ? 'Exercício só seu' : 'Catálogo da academia', item.muscle_group_primary || item.muscle_group].filter(Boolean).join(' · ');
    main.append(title, details, extra);
    row.appendChild(main);
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    if (detail?.plan?.editable) {
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'mini-button secondary'; edit.textContent = 'Editar';
      edit.addEventListener('click', (event) => { event.stopPropagation(); openExerciseEditor(item); });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'mini-button'; remove.textContent = 'Remover';
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!window.confirm(`Remover ${item.exercise_name || 'este exercício'} da sua ficha?`)) return;
        try {
          await StudentPortal.api('/api/student/training/custom/exercise/delete', { method: 'POST', body: JSON.stringify({ id: item.id }) });
          await load();
        } catch (error) { setStatus('student-portal-status', `Não foi possível remover: ${error.message}`, true); }
      });
      actions.append(edit, remove);
    }
    row.appendChild(actions);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Ver detalhes de ${item.exercise_name || 'exercício'}`);
    row.addEventListener('click', () => openExercise(item));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openExercise(item); } });
    return row;
  }

  function openExercise(item) {
    p('student-exercise-title').textContent = item.exercise_name || 'Exercício';
    p('student-exercise-subtitle').textContent = [item.day_title, item.muscle_group].filter(Boolean).join(' · ') || 'Demonstração e orientações';
    p('student-exercise-sets').textContent = item.sets || '-';
    p('student-exercise-reps').textContent = item.reps || '-';
    p('student-exercise-rest').textContent = item.rest_seconds != null ? `${item.rest_seconds}s` : '-';
    p('student-exercise-equipment').textContent = item.equipment || '-';
    p('student-exercise-primary').textContent = item.muscle_group_primary || item.muscle_group || '-';
    p('student-exercise-secondary').textContent = item.muscle_group_secondary || '-';
    p('student-exercise-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada.';
    const media = p('student-exercise-media');
    media.replaceChildren();
    if (item.video_url && window.AcademiaTrainingMedia) window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
    else {
      const empty = document.createElement('span');
      empty.className = 'exercise-view-media-empty';
      empty.textContent = 'Nenhuma demonstração cadastrada.';
      media.appendChild(empty);
    }
    p('student-exercise-modal').classList.remove('hidden');
  }

  function renderCalendar() {
    const picker = p('student-day-picker');
    picker.replaceChildren();
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      const day = dayFor(weekday);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = Number(weekday) === Number(selectedWeekday) ? 'active' : '';
      button.innerHTML = `<strong>${weekdays[weekday - 1]}</strong><small>${exercisesFor(weekday).length} exercício(s)</small>`;
      button.addEventListener('click', () => { selectedWeekday = weekday; render(); });
      picker.appendChild(button);
    }
  }

  function renderExercises() {
    const list = p('portal-exercise-list');
    list.replaceChildren();
    const day = dayFor();
    p('student-day-title').textContent = `${day.title || weekdays[selectedWeekday - 1]} · exercícios`;
    p('student-day-name').value = day.title || weekdays[selectedWeekday - 1];
    p('student-day-subtitle').textContent = detail?.plan?.editable ? 'Você pode montar este dia e salvar suas alterações.' : 'Ficha definida pela academia. Personalize para editar só a sua versão.';
    const items = exercisesFor();
    items.forEach((item) => list.appendChild(makeEntity(item)));
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = detail?.plan?.editable ? 'Nenhum exercício neste dia. Adicione o primeiro.' : 'Nenhum exercício definido para este dia.';
      list.appendChild(empty);
    }
  }

  function renderControls() {
    const editable = Boolean(detail?.plan?.editable);
    p('student-customize-button').textContent = editable ? 'Minha ficha personalizada' : 'Personalizar ficha';
    p('student-customize-button').disabled = editable;
    p('student-save-day-button').disabled = !editable;
    p('student-add-exercise-button').disabled = !editable;
    p('student-plan-status').textContent = editable ? 'Personalizada' : (detail?.plan ? 'Da academia' : 'Sem ficha');
    p('student-plan-status').className = `badge ${editable ? 'ok' : 'warn'}`;
  }

  function render() {
    renderCalendar();
    renderExercises();
    renderControls();
  }

  function fillExerciseOptions(selected = '') {
    const select = p('student-exercise-source');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione um exercício';
    select.appendChild(placeholder);
    catalog.public.forEach((item) => {
      const option = document.createElement('option');
      option.value = `public:${item.id}`;
      option.textContent = `${item.name}${item.muscle_group ? ` · ${item.muscle_group}` : ''}`;
      select.appendChild(option);
    });
    catalog.private.forEach((item) => {
      const option = document.createElement('option');
      option.value = `private:${item.id}`;
      option.textContent = `Meu exercício · ${item.name}`;
      select.appendChild(option);
    });
    const create = document.createElement('option');
    create.value = 'new-private';
    create.textContent = 'Criar exercício só para mim';
    select.appendChild(create);
    select.value = selected;
  }

  function setPrivateFieldsVisible(visible) {
    p('student-private-exercise-fields').classList.toggle('hidden', !visible);
    ['student-private-name', 'student-private-muscle', 'student-private-equipment', 'student-private-video', 'student-private-instructions'].forEach((id) => { p(id).disabled = !visible; });
  }

  function openExerciseEditor(item = null) {
    if (!detail?.plan?.editable) return;
    editingExerciseId = item?.id || null;
    p('student-exercise-editor-title').textContent = editingExerciseId ? 'Editar exercício' : 'Adicionar exercício';
    p('student-exercise-form').reset();
    p('student-exercise-sets-input').value = item?.sets || 3;
    p('student-exercise-reps-input').value = item?.reps || '10-12';
    p('student-exercise-rest-input').value = item?.rest_seconds ?? 60;
    p('student-exercise-notes-input').value = item?.notes || '';
    const selected = item ? `${item.is_private ? 'private' : 'public'}:${item.is_private ? item.private_exercise_id : item.exercise_library_id}` : '';
    fillExerciseOptions(selected);
    p('student-exercise-source').disabled = Boolean(editingExerciseId);
    setPrivateFieldsVisible(false);
    setStatus('student-exercise-editor-status', '');
    p('student-exercise-editor-modal').classList.remove('hidden');
  }

  function closeExerciseEditor() {
    p('student-exercise-editor-modal').classList.add('hidden');
    editingExerciseId = null;
  }

  async function customize() {
    p('student-customize-button').disabled = true;
    setStatus('student-calendar-status', 'Criando sua ficha privada...');
    try { await StudentPortal.api('/api/student/training/custom/plan', { method: 'POST', body: JSON.stringify({ clone_current: true }) }); await load(); }
    catch (error) { setStatus('student-calendar-status', `Não foi possível personalizar: ${error.message}`, true); p('student-customize-button').disabled = false; }
  }

  async function saveDay() {
    if (!detail?.plan?.editable) return;
    try {
      await StudentPortal.api('/api/student/training/custom/day', { method: 'POST', body: JSON.stringify({ plan_id: detail.plan.id, weekday: selectedWeekday, title: p('student-day-name').value }) });
      await load();
      setStatus('student-calendar-status', 'Dia atualizado.');
    } catch (error) { setStatus('student-calendar-status', `Não foi possível salvar o dia: ${error.message}`, true); }
  }

  async function submitExercise(event) {
    event.preventDefault();
    if (!detail?.plan?.editable) return;
    const status = 'student-exercise-editor-status';
    const source = p('student-exercise-source').value;
    if (!source) { setStatus(status, 'Selecione ou crie um exercício.', true); return; }
    const payload = { sets: p('student-exercise-sets-input').value, reps: p('student-exercise-reps-input').value, rest_seconds: p('student-exercise-rest-input').value, notes: p('student-exercise-notes-input').value };
    try {
      if (editingExerciseId) {
        await StudentPortal.api('/api/student/training/custom/exercise/update', { method: 'POST', body: JSON.stringify({ id: editingExerciseId, ...payload }) });
      } else {
        const day = dayFor();
        payload.plan_day_id = day.id;
        if (source === 'new-private') {
          const created = await StudentPortal.api('/api/student/training/custom/private-exercise', { method: 'POST', body: JSON.stringify({ name: p('student-private-name').value, muscle_group: p('student-private-muscle').value, equipment: p('student-private-equipment').value, video_url: p('student-private-video').value, instructions: p('student-private-instructions').value }) });
          payload.private_exercise_id = created.id;
        } else if (source.startsWith('private:')) payload.private_exercise_id = source.slice(8);
        else payload.exercise_id = source.slice(7);
        await StudentPortal.api('/api/student/training/custom/exercise', { method: 'POST', body: JSON.stringify(payload) });
      }
      closeExerciseEditor();
      await load();
    } catch (error) { setStatus(status, `Não foi possível salvar: ${error.message}`, true); }
  }

  async function load() {
    try {
      await StudentPortal.init();
      const me = await StudentPortal.api('/api/student/me');
      const firstName = (me.name || 'Aluno').split(' ')[0];
      p('student-portal-title').textContent = `Meu treino, ${firstName}`;
      try { detail = await StudentPortal.api('/api/student/training/current'); }
      catch (error) { if (error.message !== 'ficha_nao_encontrada') throw error; detail = { plan: null, days: weekdays.map((title, index) => ({ weekday: index + 1, title })) , exercises: [] }; }
      catalog = await StudentPortal.api('/api/student/training/catalog');
      const existingDay = detail.days?.find((day) => Number(day.weekday) === Number(selectedWeekday));
      if (!existingDay) selectedWeekday = Number(detail.days?.[0]?.weekday || selectedWeekday);
      p('student-portal-meta').textContent = detail.plan ? `Ficha: ${detail.plan.name || 'Minha ficha'} · Objetivo: ${detail.plan.goal || 'Treino personalizado'}` : 'Você ainda não tem uma ficha. Personalize para começar.';
      p('student-auto-sync').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
      setStatus('student-portal-status', '');
      render();
    } catch (error) { setStatus('student-portal-status', `Erro: ${error.message}`, true); }
  }

  p('student-customize-button').addEventListener('click', customize);
  p('student-save-day-button').addEventListener('click', saveDay);
  p('student-add-exercise-button').addEventListener('click', () => openExerciseEditor());
  p('student-exercise-source').addEventListener('change', (event) => setPrivateFieldsVisible(event.target.value === 'new-private'));
  p('student-exercise-form').addEventListener('submit', submitExercise);
  p('student-exercise-editor-close').addEventListener('click', closeExerciseEditor);
  p('student-exercise-editor-cancel').addEventListener('click', closeExerciseEditor);
  p('student-exercise-editor-modal').addEventListener('click', (event) => { if (event.target === p('student-exercise-editor-modal')) closeExerciseEditor(); });
  p('student-exercise-close').addEventListener('click', () => p('student-exercise-modal').classList.add('hidden'));
  p('student-exercise-modal').addEventListener('click', (event) => { if (event.target === p('student-exercise-modal')) p('student-exercise-modal').classList.add('hidden'); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    p('student-exercise-modal').classList.add('hidden');
    closeExerciseEditor();
  });
  window.StudentWorkout = { getDetail: () => detail };
  load();
}());
