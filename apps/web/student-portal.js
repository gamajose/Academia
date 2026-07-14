(function () {
  const p = (id) => document.getElementById(id);
  let selectedDate = toDateKey(new Date());
  let events = [];
  let catalog = [];
  let selectedEvent = null;
  let pickedExercise = null;
  let editingExerciseId = null;

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function fromDateKey(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function dateLabel(value, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
    return fromDateKey(value).toLocaleDateString('pt-BR', options);
  }

  function timeLabel(value) { return String(value || '').slice(0, 5); }
  function text(value) { return StudentPortal.escapeHtml(value ?? ''); }
  function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function status(id, message, error = false) { const element = p(id); if (!element) return; element.textContent = message || ''; element.classList.toggle('error', error); }
  function eventForDate(dateKey) { return events.filter((event) => String(event.scheduled_date).slice(0, 10) === dateKey); }
  function currentMonth() { return selectedDate.slice(0, 7); }

  function renderSelectedDate() {
    const date = fromDateKey(selectedDate);
    p('student-selected-date-weekday').textContent = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    p('student-selected-date-title').textContent = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    const list = p('student-event-list');
    list.replaceChildren();
    const dayEvents = eventForDate(selectedDate);
    if (!dayEvents.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state student-day-empty';
      empty.innerHTML = '<strong>Nenhum treino para este dia.</strong><span>Crie uma sessão para organizar seu horário e seus exercícios.</span>';
      list.appendChild(empty);
      return;
    }
    dayEvents.forEach((event) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `student-event-card${selectedEvent?.id === event.id ? ' is-selected' : ''}`;
      const muscles = [...new Set(event.exercises.flatMap((item) => [item.muscle_group_primary, item.muscle_group_secondary, item.muscle_group].filter(Boolean).flatMap((value) => String(value).split(',').map((part) => part.trim()))))].slice(0, 3);
      card.innerHTML = `<span class="student-event-time">${text(timeLabel(event.start_time))}${event.end_time ? ` - ${text(timeLabel(event.end_time))}` : ''}</span><span class="student-event-copy"><strong>${text(event.title)}</strong><small>${event.exercises.length} exercício(s)${muscles.length ? ` · ${text(muscles.join(', '))}` : ''}</small></span><span class="student-event-chevron" aria-hidden="true">›</span>`;
      card.addEventListener('click', () => { selectedEvent = event; renderSelectedDate(); renderEventDetail(); });
      list.appendChild(card);
    });
  }

  function appendExerciseMedia(host, item) {
    if (item.image_url) {
      const image = document.createElement('img');
      image.className = 'student-exercise-inline-image'; image.src = item.image_url; image.alt = `Demonstração de ${item.exercise_name || 'exercício'}`; image.loading = 'lazy'; host.appendChild(image);
    }
    if (item.video_url && window.AcademiaTrainingMedia) window.AcademiaTrainingMedia.appendVideoPreview(host, item.video_url);
  }

  function renderEventDetail() {
    const panel = p('student-event-detail-panel');
    if (!selectedEvent) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    p('student-event-detail-title').textContent = selectedEvent.title;
    p('student-event-detail-time').textContent = `${dateLabel(String(selectedEvent.scheduled_date).slice(0, 10))} · ${timeLabel(selectedEvent.start_time)}${selectedEvent.end_time ? ` - ${timeLabel(selectedEvent.end_time)}` : ''}`;
    p('student-event-detail-notes').textContent = selectedEvent.notes || 'Sem observações para este treino.';
    const list = p('student-event-exercise-list'); list.replaceChildren();
    if (!selectedEvent.exercises.length) {
      const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício adicionado a este treino.'; list.appendChild(empty); return;
    }
    selectedEvent.exercises.forEach((item) => {
      const row = document.createElement('li'); row.className = 'entity-card student-workout-exercise-row';
      const main = document.createElement('div'); main.className = 'entity-main';
      main.innerHTML = `<strong>${text(item.exercise_name || 'Exercício')}</strong><span>${text(item.sets || '-')} séries · ${text(item.reps || '-')} repetições · ${text(item.rest_seconds ?? '-')}s de descanso</span><span>${text([item.is_private ? 'Exercício personalizado' : 'Catálogo da academia', item.muscle_group_primary || item.muscle_group].filter(Boolean).join(' · '))}</span>`;
      const media = document.createElement('div'); media.className = 'student-exercise-inline-media'; appendExerciseMedia(media, item); if (!media.children.length) media.hidden = true;
      main.appendChild(media); row.appendChild(main);
      const actions = document.createElement('div'); actions.className = 'entity-actions';
      const view = document.createElement('button'); view.type = 'button'; view.className = 'mini-button secondary'; view.textContent = 'Ver detalhes'; view.addEventListener('click', () => openExercise(item));
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'mini-button secondary'; edit.textContent = 'Editar'; edit.addEventListener('click', () => openExercisePicker(item));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mini-button'; remove.textContent = 'Remover'; remove.addEventListener('click', () => removeEventExercise(item));
      actions.append(view, edit, remove); row.appendChild(actions); list.appendChild(row);
    });
  }

  function openExercise(item) {
    p('student-exercise-title').textContent = item.exercise_name || 'Exercício';
    p('student-exercise-subtitle').textContent = [item.muscle_group, item.is_private ? 'Exercício personalizado' : 'Catálogo da academia'].filter(Boolean).join(' · ');
    p('student-exercise-sets').textContent = item.sets || '-'; p('student-exercise-reps').textContent = item.reps || '-'; p('student-exercise-rest').textContent = item.rest_seconds != null ? `${item.rest_seconds}s` : '-';
    p('student-exercise-equipment').textContent = item.equipment || '-'; p('student-exercise-primary').textContent = item.muscle_group_primary || item.muscle_group || '-'; p('student-exercise-secondary').textContent = item.muscle_group_secondary || '-'; p('student-exercise-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada.';
    const media = p('student-exercise-media'); media.replaceChildren(); appendExerciseMedia(media, item); if (!media.children.length) { const empty = document.createElement('span'); empty.className = 'exercise-view-media-empty'; empty.textContent = 'Nenhuma demonstração cadastrada.'; media.appendChild(empty); }
    p('student-exercise-modal').classList.remove('hidden');
  }

  function renderExerciseResults() {
    const list = p('student-exercise-results'); list.replaceChildren();
    const action = document.createElement('button'); action.type = 'button'; action.className = 'student-exercise-result student-custom-exercise-result'; action.innerHTML = '<strong>＋ Criar exercício personalizado</strong><small>Fica disponível somente na sua conta</small>'; action.addEventListener('click', openPrivateExercise); list.appendChild(action);
    const query = normalize(p('student-exercise-search').value);
    const matches = catalog.filter((item) => !query || normalize(`${item.name} ${item.muscle_group} ${item.equipment}`).includes(query)).slice(0, 50);
    if (!matches.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício do catálogo encontrado.'; list.appendChild(empty); return; }
    matches.forEach((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'student-exercise-result'; button.innerHTML = `<strong>${text(item.name)}</strong><small>${text([item.muscle_group_primary || item.muscle_group, item.muscle_group_secondary, item.equipment, item.is_private ? 'Personalizado' : 'Academia'].filter(Boolean).join(' · '))}</small>`;
      button.addEventListener('click', () => pickExercise(item)); list.appendChild(button);
    });
  }

  function pickExercise(item) {
    pickedExercise = item; p('student-picked-exercise-name').textContent = item.name || item.exercise_name || 'Exercício selecionado'; p('student-event-exercise-sets').value = item.sets || 3; p('student-event-exercise-reps').value = item.reps || '10-12'; p('student-event-exercise-rest').value = item.rest_seconds ?? 60; p('student-event-exercise-notes').value = item.notes || ''; p('student-event-exercise-form').classList.remove('hidden'); p('student-exercise-search').disabled = true; p('student-exercise-results').classList.add('hidden'); setTimeout(() => p('student-event-exercise-sets').focus(), 0);
  }

  function clearPickedExercise() { pickedExercise = null; editingExerciseId = null; p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('hidden'); renderExerciseResults(); }
  function openExercisePicker(item = null) { if (!selectedEvent) { status('student-event-detail-status', 'Escolha um treino antes de adicionar exercícios.', true); return; } editingExerciseId = item?.id || null; p('student-exercise-picker-title').textContent = editingExerciseId ? 'Editar exercício do treino' : 'Exercícios do treino'; p('student-exercise-search').value = ''; p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('hidden'); p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-picker-modal').classList.remove('hidden'); renderExerciseResults(); if (item) pickExercise(item); }
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
    try { const result = await StudentPortal.api('/api/student/training/calendar/event', { method: 'POST', body: JSON.stringify(payload) }); selectedDate = payload.scheduled_date; selectedEvent = result; closeEventEditor(); await loadCalendar(); selectedEvent = events.find((item) => item.id === result.id) || null; renderEventDetail(); }
    catch (error) { status('student-event-editor-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function removeEvent() {
    if (!selectedEvent || !window.confirm(`Remover o treino "${selectedEvent.title}"?`)) return;
    try { await StudentPortal.api('/api/student/training/calendar/event/delete', { method: 'POST', body: JSON.stringify({ id: selectedEvent.id }) }); selectedEvent = null; await loadCalendar(); } catch (error) { status('student-event-detail-status', `Não foi possível remover: ${error.message}`, true); }
  }

  async function saveEventExercise(event) {
    event.preventDefault(); if (!selectedEvent || !pickedExercise) return;
    const payload = { sets: p('student-event-exercise-sets').value, reps: p('student-event-exercise-reps').value, rest_seconds: p('student-event-exercise-rest').value, notes: p('student-event-exercise-notes').value };
    try { if (editingExerciseId) await StudentPortal.api('/api/student/training/calendar/event/exercise/update', { method: 'POST', body: JSON.stringify({ id: editingExerciseId, ...payload }) }); else { payload.event_id = selectedEvent.id; if (pickedExercise.is_private) payload.private_exercise_id = pickedExercise.id; else payload.exercise_id = pickedExercise.id; await StudentPortal.api('/api/student/training/calendar/event/exercise', { method: 'POST', body: JSON.stringify(payload) }); } closeExercisePicker(); await loadCalendar(); } catch (error) { status('student-exercise-picker-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function removeEventExercise(item) { if (!window.confirm(`Remover ${item.exercise_name || 'este exercício'} deste treino?`)) return; try { await StudentPortal.api('/api/student/training/calendar/event/exercise/delete', { method: 'POST', body: JSON.stringify({ id: item.id }) }); await loadCalendar(); } catch (error) { status('student-event-detail-status', `Não foi possível remover: ${error.message}`, true); } }

  async function uploadImage(file) {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG, GIF ou WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem não pode ultrapassar 5 MB.');
    const form = new FormData(); form.append('file', file, file.name);
    const response = await fetch(`${StudentPortal.apiBase}/api/editor/images`, { method: 'POST', headers: { Authorization: `Bearer ${StudentPortal.getToken()}` }, body: form });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a imagem.'); return data.location || '';
  }

  async function savePrivateExercise(event) {
    event.preventDefault(); if (!selectedEvent) return;
    try {
      const file = p('student-private-image-file').files?.[0];
      const imageUrl = file ? await uploadImage(file) : p('student-private-image-url').value.trim();
      const created = await StudentPortal.api('/api/student/training/custom/private-exercise', { method: 'POST', body: JSON.stringify({ name: p('student-private-name').value, muscle_group_primary: p('student-private-primary').value, muscle_group_secondary: p('student-private-secondary').value, equipment: p('student-private-equipment').value, image_url: imageUrl, video_url: p('student-private-video').value, instructions: p('student-private-instructions').value }) });
      await StudentPortal.api('/api/student/training/calendar/event/exercise', { method: 'POST', body: JSON.stringify({ event_id: selectedEvent.id, private_exercise_id: created.id, sets: 3, reps: '10-12', rest_seconds: 60 }) });
      closePrivateExercise(); await loadCalendar();
    } catch (error) { status('student-private-exercise-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  function icsEscape(value) { return String(value || '').replace(/[\\;,\n]/g, (character) => character === '\n' ? '\\n' : `\\${character}`); }
  function icsDate(date, time) { return `${String(date).replaceAll('-', '')}T${String(time || '00:00').replace(':', '')}00`; }
  function importToCalendar() {
    if (!selectedEvent) return;
    const start = icsDate(String(selectedEvent.scheduled_date).slice(0, 10), timeLabel(selectedEvent.start_time)); const end = icsDate(String(selectedEvent.scheduled_date).slice(0, 10), timeLabel(selectedEvent.end_time || selectedEvent.start_time));
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BlueREC//Treinos//PT-BR', 'BEGIN:VEVENT', `UID:${selectedEvent.id}@bluerec`, `DTSTAMP:${icsDate(toDateKey(new Date()), new Date().toTimeString().slice(0, 5))}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${icsEscape(selectedEvent.title)}`, `DESCRIPTION:${icsEscape(selectedEvent.notes || '')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${normalize(selectedEvent.title).replace(/\s+/g, '-') || 'treino'}.ics`; link.click(); URL.revokeObjectURL(url); status('student-event-detail-status', 'Arquivo de agenda gerado. Abra-o no calendário do celular para importar o treino.');
  }

  async function loadCalendar() {
    try { const result = await StudentPortal.api(`/api/student/training/calendar?month=${encodeURIComponent(currentMonth())}`); events = result.events || []; if (selectedEvent) selectedEvent = events.find((event) => event.id === selectedEvent.id) || null; renderSelectedDate(); renderEventDetail(); p('student-auto-sync').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`; status('student-calendar-status', ''); }
    catch (error) { status('student-portal-status', `Não foi possível carregar seus treinos: ${error.message}`, true); }
  }

  async function moveDay(offset) { const date = fromDateKey(selectedDate); date.setDate(date.getDate() + offset); selectedDate = toDateKey(date); selectedEvent = null; await loadCalendar(); }

  async function load() {
    try { await StudentPortal.init(); const me = await StudentPortal.api('/api/student/me'); p('student-portal-title').textContent = `Meu treino, ${(me.name || 'Aluno').split(' ')[0]}`; const result = await StudentPortal.api('/api/student/training/catalog'); catalog = [...(result.public || []).map((item) => ({ ...item, is_private: false })), ...(result.private || []).map((item) => ({ ...item, is_private: true }))]; await loadCalendar(); }
    catch (error) { status('student-portal-status', `Erro: ${error.message}`, true); }
  }

  p('student-day-previous').addEventListener('click', () => moveDay(-1)); p('student-day-next').addEventListener('click', () => moveDay(1)); p('student-new-event-button').addEventListener('click', () => openEventEditor());
  p('student-event-form').addEventListener('submit', saveEvent); p('student-event-editor-close').addEventListener('click', closeEventEditor); p('student-event-editor-cancel').addEventListener('click', closeEventEditor); p('student-edit-event-button').addEventListener('click', () => openEventEditor(selectedEvent)); p('student-add-event-exercise-button').addEventListener('click', () => openExercisePicker()); p('student-import-calendar-button').addEventListener('click', importToCalendar); p('student-delete-event-button').addEventListener('click', removeEvent);
  p('student-exercise-search').addEventListener('input', renderExerciseResults); p('student-event-exercise-form').addEventListener('submit', saveEventExercise); p('student-clear-picked-exercise').addEventListener('click', clearPickedExercise); p('student-exercise-picker-close').addEventListener('click', closeExercisePicker); p('student-private-exercise-form').addEventListener('submit', savePrivateExercise); p('student-private-exercise-close').addEventListener('click', closePrivateExercise); p('student-private-exercise-cancel').addEventListener('click', closePrivateExercise); p('student-exercise-close').addEventListener('click', () => p('student-exercise-modal').classList.add('hidden'));
  [p('student-event-editor-modal'), p('student-exercise-picker-modal'), p('student-private-exercise-modal'), p('student-exercise-modal')].forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); }));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach((modal) => modal.classList.add('hidden')); });
  window.StudentWorkout = { getEvents: () => events };
  load();
}());
