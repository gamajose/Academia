(function () {
  const p = (id) => document.getElementById(id);
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = toDateKey(new Date());
  let events = [];
  let catalog = [];
  let selectedEvent = null;
  let pickedExercise = null;
  let editingExerciseId = null;

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function monthKey() { return `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`; }
  function dateLabel(dateKey, options = { weekday: 'long', day: 'numeric', month: 'long' }) { return new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', options); }
  function timeLabel(value) { return String(value || '').slice(0, 5); }
  function text(value) { return StudentPortal.escapeHtml(value ?? ''); }
  function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function status(id, message, error = false) { const element = p(id); if (!element) return; element.textContent = message || ''; element.classList.toggle('error', error); }

  function eventForDate(dateKey) { return events.filter((event) => String(event.scheduled_date).slice(0, 10) === dateKey); }

  function renderCalendar() {
    p('student-calendar-month').textContent = `${monthNames[monthCursor.getMonth()]} de ${monthCursor.getFullYear()}`;
    const grid = p('student-calendar-grid');
    grid.replaceChildren();
    const firstDay = (new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay() + 6) % 7;
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    for (let index = 0; index < firstDay; index += 1) {
      const blank = document.createElement('span'); blank.className = 'student-calendar-day is-empty'; grid.appendChild(blank);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = toDateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `student-calendar-day${dateKey === selectedDate ? ' is-selected' : ''}${dateKey === toDateKey(new Date()) ? ' is-today' : ''}`;
      const dayNumber = document.createElement('strong'); dayNumber.textContent = day;
      cell.appendChild(dayNumber);
      const dayEvents = eventForDate(dateKey);
      if (dayEvents.length) {
        const count = document.createElement('small'); count.textContent = `${dayEvents.length} treino${dayEvents.length > 1 ? 's' : ''}`; cell.appendChild(count);
        const preview = document.createElement('span'); preview.className = 'student-calendar-event-preview'; preview.textContent = dayEvents[0].title; cell.appendChild(preview);
      }
      cell.addEventListener('click', () => { selectedDate = dateKey; selectedEvent = null; renderCalendar(); renderSelectedDate(); renderEventDetail(); });
      grid.appendChild(cell);
    }
  }

  function renderSelectedDate() {
    p('student-selected-date-title').textContent = dateLabel(selectedDate);
    const list = p('student-event-list'); list.replaceChildren();
    const dayEvents = eventForDate(selectedDate);
    if (!dayEvents.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Nenhum treino agendado para este dia.'; list.appendChild(empty); return;
    }
    dayEvents.forEach((event) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = `student-event-card${selectedEvent?.id === event.id ? ' is-selected' : ''}`;
      card.innerHTML = `<span class="student-event-time">${text(timeLabel(event.start_time))}${event.end_time ? ` - ${text(timeLabel(event.end_time))}` : ''}</span><strong>${text(event.title)}</strong><small>${event.exercises.length} exercício(s)</small>`;
      card.addEventListener('click', () => { selectedEvent = event; renderSelectedDate(); renderEventDetail(); });
      list.appendChild(card);
    });
  }

  function renderEventDetail() {
    const panel = p('student-event-detail-panel');
    if (!selectedEvent) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    p('student-event-detail-title').textContent = selectedEvent.title;
    p('student-event-detail-time').textContent = `${dateLabel(String(selectedEvent.scheduled_date).slice(0, 10))} · ${timeLabel(selectedEvent.start_time)}${selectedEvent.end_time ? ` - ${timeLabel(selectedEvent.end_time)}` : ''}`;
    p('student-event-detail-notes').textContent = selectedEvent.notes || '';
    const list = p('student-event-exercise-list'); list.replaceChildren();
    if (!selectedEvent.exercises.length) {
      const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício adicionado a este treino.'; list.appendChild(empty); return;
    }
    selectedEvent.exercises.forEach((item) => {
      const row = document.createElement('li'); row.className = 'entity-card student-workout-exercise-row';
      const main = document.createElement('div'); main.className = 'entity-main'; main.innerHTML = `<strong>${text(item.exercise_name || 'Exercício')}</strong><span>${text(item.sets || '-')} séries · ${text(item.reps || '-')} repetições · ${text(item.rest_seconds ?? '-')}s de descanso</span><span>${text([item.is_private ? 'Exercício pessoal' : 'Catálogo da academia', item.muscle_group_primary || item.muscle_group].filter(Boolean).join(' · '))}</span>`;
      row.appendChild(main);
      const actions = document.createElement('div'); actions.className = 'entity-actions';
      const view = document.createElement('button'); view.type = 'button'; view.className = 'mini-button secondary'; view.textContent = 'Ver'; view.addEventListener('click', () => openExercise(item));
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'mini-button secondary'; edit.textContent = 'Editar'; edit.addEventListener('click', () => openExercisePicker(item));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mini-button'; remove.textContent = 'Remover'; remove.addEventListener('click', () => removeEventExercise(item));
      actions.append(view, edit, remove); row.appendChild(actions); list.appendChild(row);
    });
  }

  function openExercise(item) {
    p('student-exercise-title').textContent = item.exercise_name || 'Exercício';
    p('student-exercise-subtitle').textContent = [item.muscle_group, item.is_private ? 'Exercício pessoal' : 'Catálogo da academia'].filter(Boolean).join(' · ');
    p('student-exercise-sets').textContent = item.sets || '-'; p('student-exercise-reps').textContent = item.reps || '-'; p('student-exercise-rest').textContent = item.rest_seconds != null ? `${item.rest_seconds}s` : '-';
    p('student-exercise-equipment').textContent = item.equipment || '-'; p('student-exercise-primary').textContent = item.muscle_group_primary || item.muscle_group || '-'; p('student-exercise-secondary').textContent = item.muscle_group_secondary || '-'; p('student-exercise-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada.';
    const media = p('student-exercise-media'); media.replaceChildren();
    if (item.video_url && window.AcademiaTrainingMedia) window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url); else { const empty = document.createElement('span'); empty.className = 'exercise-view-media-empty'; empty.textContent = 'Nenhuma demonstração cadastrada.'; media.appendChild(empty); }
    p('student-exercise-modal').classList.remove('hidden');
  }

  function renderExerciseResults() {
    const list = p('student-exercise-results'); list.replaceChildren();
    const query = normalize(p('student-exercise-search').value);
    const matches = catalog.filter((item) => !query || normalize(`${item.name} ${item.muscle_group} ${item.equipment}`).includes(query)).slice(0, 50);
    if (!matches.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício encontrado.'; list.appendChild(empty); return; }
    matches.forEach((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'student-exercise-result'; button.innerHTML = `<strong>${text(item.name)}</strong><small>${text([item.muscle_group, item.equipment, item.is_private ? 'Pessoal' : 'Catálogo'].filter(Boolean).join(' · '))}</small>`;
      button.addEventListener('click', () => pickExercise(item)); list.appendChild(button);
    });
  }

  function pickExercise(item) {
    pickedExercise = item;
    p('student-picked-exercise-name').textContent = item.name || item.exercise_name || 'Exercício selecionado';
    p('student-event-exercise-sets').value = item.sets || 3;
    p('student-event-exercise-reps').value = item.reps || '10-12';
    p('student-event-exercise-rest').value = item.rest_seconds ?? 60;
    p('student-event-exercise-notes').value = item.notes || '';
    p('student-event-exercise-form').classList.remove('hidden');
    p('student-exercise-search').disabled = true;
    p('student-exercise-results').classList.add('hidden');
    p('student-new-private-exercise').classList.add('hidden');
    setTimeout(() => p('student-event-exercise-sets').focus(), 0);
  }

  function clearPickedExercise() {
    pickedExercise = null; editingExerciseId = null; p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('hidden'); p('student-new-private-exercise').classList.remove('hidden'); renderExerciseResults();
  }

  function openExercisePicker(item = null) {
    if (!selectedEvent) { status('student-event-detail-status', 'Escolha uma sessão antes de adicionar exercícios.', true); return; }
    editingExerciseId = item?.id || null; p('student-exercise-picker-title').textContent = editingExerciseId ? 'Editar exercício do treino' : 'Adicionar exercício'; p('student-exercise-search').value = ''; p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('hidden'); p('student-new-private-exercise').classList.toggle('hidden', Boolean(editingExerciseId)); p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-picker-modal').classList.remove('hidden');
    renderExerciseResults();
    if (item) pickExercise(item);
  }

  function closeExercisePicker() { p('student-exercise-picker-modal').classList.add('hidden'); clearPickedExercise(); }

  function openEventEditor(event = null) {
    p('student-event-editor-title').textContent = event ? 'Editar treino' : 'Novo treino'; p('student-event-form').dataset.id = event?.id || ''; p('student-event-title').value = event?.title || ''; p('student-event-date').value = String(event?.scheduled_date || selectedDate).slice(0, 10); p('student-event-start').value = timeLabel(event?.start_time) || '18:00'; p('student-event-end').value = timeLabel(event?.end_time) || '19:00'; p('student-event-notes').value = event?.notes || ''; status('student-event-editor-status', ''); p('student-event-editor-modal').classList.remove('hidden');
  }

  function closeEventEditor() { p('student-event-editor-modal').classList.add('hidden'); }
  function openPrivateExercise() { closeExercisePicker(); p('student-private-exercise-form').reset(); status('student-private-exercise-status', ''); p('student-private-exercise-modal').classList.remove('hidden'); }
  function closePrivateExercise() { p('student-private-exercise-modal').classList.add('hidden'); }

  async function saveEvent(event) {
    event.preventDefault();
    const payload = { id: p('student-event-form').dataset.id || undefined, title: p('student-event-title').value, scheduled_date: p('student-event-date').value, start_time: p('student-event-start').value, end_time: p('student-event-end').value, notes: p('student-event-notes').value };
    try { await StudentPortal.api('/api/student/training/calendar/event', { method: 'POST', body: JSON.stringify(payload) }); closeEventEditor(); selectedDate = payload.scheduled_date; await loadCalendar(); }
    catch (error) { status('student-event-editor-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function removeEvent() {
    if (!selectedEvent || !window.confirm(`Remover o treino "${selectedEvent.title}"?`)) return;
    try { await StudentPortal.api('/api/student/training/calendar/event/delete', { method: 'POST', body: JSON.stringify({ id: selectedEvent.id }) }); selectedEvent = null; await loadCalendar(); }
    catch (error) { status('student-event-detail-status', `Não foi possível remover: ${error.message}`, true); }
  }

  async function saveEventExercise(event) {
    event.preventDefault(); if (!selectedEvent || !pickedExercise) return;
    const payload = { sets: p('student-event-exercise-sets').value, reps: p('student-event-exercise-reps').value, rest_seconds: p('student-event-exercise-rest').value, notes: p('student-event-exercise-notes').value };
    try {
      if (editingExerciseId) { await StudentPortal.api('/api/student/training/calendar/event/exercise/update', { method: 'POST', body: JSON.stringify({ id: editingExerciseId, ...payload }) }); }
      else { payload.event_id = selectedEvent.id; if (pickedExercise.is_private) payload.private_exercise_id = pickedExercise.id; else payload.exercise_id = pickedExercise.id; await StudentPortal.api('/api/student/training/calendar/event/exercise', { method: 'POST', body: JSON.stringify(payload) }); }
      closeExercisePicker(); await loadCalendar();
    } catch (error) { status('student-exercise-picker-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function removeEventExercise(item) {
    if (!window.confirm(`Remover ${item.exercise_name || 'este exercício'} deste treino?`)) return;
    try { await StudentPortal.api('/api/student/training/calendar/event/exercise/delete', { method: 'POST', body: JSON.stringify({ id: item.id }) }); await loadCalendar(); }
    catch (error) { status('student-event-detail-status', `Não foi possível remover: ${error.message}`, true); }
  }

  async function savePrivateExercise(event) {
    event.preventDefault();
    if (!selectedEvent) return;
    try {
      const created = await StudentPortal.api('/api/student/training/custom/private-exercise', { method: 'POST', body: JSON.stringify({ name: p('student-private-name').value, muscle_group: p('student-private-muscle').value, equipment: p('student-private-equipment').value, video_url: p('student-private-video').value, instructions: p('student-private-instructions').value }) });
      await StudentPortal.api('/api/student/training/calendar/event/exercise', { method: 'POST', body: JSON.stringify({ event_id: selectedEvent.id, private_exercise_id: created.id, sets: 3, reps: '10-12', rest_seconds: 60 }) });
      closePrivateExercise(); await loadCalendar();
    } catch (error) { status('student-private-exercise-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function loadCalendar() {
    try {
      const result = await StudentPortal.api(`/api/student/training/calendar?month=${encodeURIComponent(monthKey())}`);
      events = result.events || [];
      if (selectedEvent) selectedEvent = events.find((event) => event.id === selectedEvent.id) || null;
      renderCalendar(); renderSelectedDate(); renderEventDetail();
      p('student-auto-sync').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
      status('student-calendar-status', '');
    } catch (error) { status('student-calendar-status', `Não foi possível carregar o calendário: ${error.message}`, true); }
  }

  async function load() {
    try {
      await StudentPortal.init();
      const me = await StudentPortal.api('/api/student/me');
      p('student-portal-title').textContent = `Meu treino, ${(me.name || 'Aluno').split(' ')[0]}`;
      const catalogResult = await StudentPortal.api('/api/student/training/catalog');
      catalog = [...(catalogResult.public || []).map((item) => ({ ...item, is_private: false })), ...(catalogResult.private || []).map((item) => ({ ...item, is_private: true }))];
      await loadCalendar();
    } catch (error) { status('student-portal-status', `Erro: ${error.message}`, true); }
  }

  p('student-calendar-previous').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); selectedDate = toDateKey(monthCursor); selectedEvent = null; loadCalendar(); });
  p('student-calendar-next').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); selectedDate = toDateKey(monthCursor); selectedEvent = null; loadCalendar(); });
  p('student-calendar-today').addEventListener('click', () => { monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedDate = toDateKey(new Date()); selectedEvent = null; loadCalendar(); });
  p('student-new-event-button').addEventListener('click', () => openEventEditor()); p('student-selected-date-new').addEventListener('click', () => openEventEditor());
  p('student-event-form').addEventListener('submit', saveEvent); p('student-event-editor-close').addEventListener('click', closeEventEditor); p('student-event-editor-cancel').addEventListener('click', closeEventEditor);
  p('student-edit-event-button').addEventListener('click', () => openEventEditor(selectedEvent)); p('student-add-event-exercise-button').addEventListener('click', () => openExercisePicker());
  p('student-delete-event-button').addEventListener('click', removeEvent);
  p('student-exercise-search').addEventListener('input', renderExerciseResults); p('student-new-private-exercise').addEventListener('click', openPrivateExercise); p('student-event-exercise-form').addEventListener('submit', saveEventExercise); p('student-clear-picked-exercise').addEventListener('click', clearPickedExercise); p('student-exercise-picker-close').addEventListener('click', closeExercisePicker);
  p('student-private-exercise-form').addEventListener('submit', savePrivateExercise); p('student-private-exercise-close').addEventListener('click', closePrivateExercise); p('student-private-exercise-cancel').addEventListener('click', closePrivateExercise); p('student-exercise-close').addEventListener('click', () => p('student-exercise-modal').classList.add('hidden'));
  [p('student-event-editor-modal'), p('student-exercise-picker-modal'), p('student-private-exercise-modal'), p('student-exercise-modal')].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); }));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') [p('student-event-editor-modal'), p('student-exercise-picker-modal'), p('student-private-exercise-modal'), p('student-exercise-modal')].forEach((modal) => modal.classList.add('hidden')); });
  window.StudentWorkout = { getEvents: () => events };
  load();
}());
