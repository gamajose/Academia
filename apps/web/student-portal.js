(function () {
  const p = (id) => document.getElementById(id);
  let selectedDate = toDateKey(new Date());
  let events = [];
  let catalog = [];
  let selectedEvent = null;
  let pickedExercise = null;
  let editingExerciseId = null;
  let selectedExerciseDrafts = [];
  let privateExerciseDraftMode = false;
  let exercisePreviewTimer = null;
  let exercisePreviewNode = null;
  let activeWeekday = weekdayForDate(selectedDate);
  let weeklyExerciseDrafts = new Map();

  function revealTrainingContent() {
    const shell = document.querySelector('main.app-shell');
    const workspace = p('student-event-detail-panel');
    if (shell) {
      shell.hidden = false;
      shell.classList.remove('hidden');
      shell.style.setProperty('display', 'block', 'important');
      shell.style.setProperty('visibility', 'visible', 'important');
      shell.style.setProperty('opacity', '1', 'important');
    }
    if (workspace) {
      workspace.hidden = false;
      workspace.classList.remove('hidden');
      workspace.style.setProperty('display', 'grid', 'important');
      workspace.style.setProperty('visibility', 'visible', 'important');
      workspace.style.setProperty('opacity', '1', 'important');
    }
  }

  async function loadApprovedAnalysis() {
    try {
      const result = await StudentPortal.api('/api/student/training/analysis');
      const analysis = result.analysis;
      if (!analysis?.student_message) return;
      p('student-approved-analysis-message').textContent = analysis.student_message;
      p('student-approved-analysis').classList.remove('hidden');
    } catch (_) {
      // A orientação é opcional e nunca bloqueia o carregamento do treino.
    }
  }

  revealTrainingContent();

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
  function on(id, eventName, handler) { p(id)?.addEventListener(eventName, handler); }
  function eventForDate(dateKey) { return events.filter((event) => String(event.scheduled_date).slice(0, 10) === dateKey); }
  function currentMonth() { return selectedDate.slice(0, 7); }
  function weekdayForDate(dateKey) { const day = fromDateKey(dateKey).getDay(); return day === 0 ? 7 : day; }
  function dateForWeekday(dateKey, weekday) { const date = fromDateKey(dateKey); const current = weekdayForDate(dateKey); date.setDate(date.getDate() + Number(weekday) - current); return toDateKey(date); }
  function weekdayLabel(weekday) { return ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'][Number(weekday) - 1] || 'Dia'; }
  function catalogValues(selector) {
    return [...new Set(catalog.flatMap((item) => String(item[selector] || '').split(',').map((value) => value.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function populateMuscleFilters() {
    [['student-event-muscle-primary', 'Músculo primário', catalogValues('muscle_group_primary')], ['student-event-muscle-secondary', 'Músculo secundário', catalogValues('muscle_group_secondary')], ['student-picker-muscle-primary', 'Músculo primário', catalogValues('muscle_group_primary')], ['student-picker-muscle-secondary', 'Músculo secundário', catalogValues('muscle_group_secondary')]].forEach(([id, label, values]) => {
      const select = p(id); if (!select) return;
      const current = select.value; select.replaceChildren(new Option(`Todos os ${label.toLowerCase().replace('músculo ', '')}`, ''));
      values.forEach((value) => select.appendChild(new Option(value, value)));
      if (values.includes(current)) select.value = current;
    });
  }
  function filteredCatalog(query, primary, secondary) {
    const normalizedQuery = normalize(query);
    return catalog.filter((item) => {
      const searchable = normalize(`${item.name || ''} ${item.muscle_group || ''} ${item.muscle_group_primary || ''} ${item.muscle_group_secondary || ''} ${item.equipment || ''}`);
      const primaryMatch = !primary || String(item.muscle_group_primary || '').split(',').map((value) => normalize(value.trim())).includes(normalize(primary));
      const secondaryMatch = !secondary || String(item.muscle_group_secondary || '').split(',').map((value) => normalize(value.trim())).includes(normalize(secondary));
      return (!normalizedQuery || searchable.includes(normalizedQuery)) && primaryMatch && secondaryMatch;
    });
  }
  function renderWeekdayPicker() {
    document.querySelectorAll('#student-weekday-picker [data-weekday]').forEach((button) => {
      const weekday = Number(button.dataset.weekday); button.classList.toggle('active', weekday === activeWeekday); button.setAttribute('aria-selected', String(weekday === activeWeekday));
      const count = weeklyExerciseDrafts.get(weekday)?.length || 0; const countNode = button.querySelector('small'); if (countNode) countNode.textContent = count ? `${count} exercício${count === 1 ? '' : 's'}` : 'Sem exercícios';
    });
    const label = p('student-active-weekday-label'); if (label) label.textContent = `Exercícios de ${weekdayLabel(activeWeekday)}`;
  }
  function syncActiveWeekday() { weeklyExerciseDrafts.set(activeWeekday, selectedExerciseDrafts.map((draft) => ({ ...draft }))); renderWeekdayPicker(); }
  function selectWeekday(weekday) { syncActiveWeekday(); activeWeekday = Number(weekday); selectedExerciseDrafts = (weeklyExerciseDrafts.get(activeWeekday) || []).map((draft) => ({ ...draft })); renderWeekdayPicker(); renderEventExerciseOptions(); }

  function hideExercisePreview() {
    if (exercisePreviewTimer) { clearTimeout(exercisePreviewTimer); exercisePreviewTimer = null; }
    exercisePreviewNode?.remove(); exercisePreviewNode = null;
  }

  function showExercisePreview(item, button, touch = false) {
    const source = item.video_url || item.image_url;
    if (!source || !window.AcademiaTrainingMedia) return;
    hideExercisePreview();
    const preview = document.createElement('div'); preview.className = `student-exercise-hover-preview${touch ? ' is-touch-preview' : ''}`; preview.setAttribute('role', 'status');
    const title = document.createElement('strong'); title.textContent = item.name || item.exercise_name || 'Exercício';
    const media = document.createElement('div'); media.className = 'student-exercise-hover-media';
    if (item.video_url) window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
    else { const image = document.createElement('img'); image.src = item.image_url; image.alt = ''; image.loading = 'eager'; media.appendChild(image); }
    preview.append(title, media); document.body.appendChild(preview); exercisePreviewNode = preview;
    if (!touch) {
      const rect = button.getBoundingClientRect();
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - preview.offsetWidth - 12);
      const top = rect.bottom + 8 + preview.offsetHeight <= window.innerHeight ? rect.bottom + 8 : rect.top - preview.offsetHeight - 8;
      preview.style.left = `${left}px`; preview.style.top = `${Math.max(12, top)}px`;
    }
  }

  function bindExercisePreview(button, item) {
    if (!item.video_url && !item.image_url) return;
    button.addEventListener('mouseenter', () => showExercisePreview(item, button));
    button.addEventListener('mouseleave', hideExercisePreview);
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      exercisePreviewTimer = setTimeout(() => showExercisePreview(item, button, true), 450);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => button.addEventListener(eventName, hideExercisePreview));
  }

  function renderSelectedDate() {
    const list = p('student-event-list');
    list.replaceChildren();
    const dayEvents = eventForDate(selectedDate).filter((event) => !event.is_weekly || event.exercises?.length);
    if (!dayEvents.length) {
      list.classList.add('hidden');
      return;
    }
    if (dayEvents.length === 1 && selectedEvent?.id === dayEvents[0].id) {
      list.classList.add('hidden');
      return;
    }
    list.classList.remove('hidden');
    dayEvents.forEach((event) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `student-event-card${selectedEvent?.id === event.id ? ' is-selected' : ''}`;
      card.setAttribute('aria-label', `Abrir ${event.title || 'treino'}`);
      card.innerHTML = '<span class="student-event-calendar-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></span><span class="student-event-copy"><strong>' + text(event.title || 'Treino') + '</strong></span><span class="student-event-chevron" aria-hidden="true">›</span>';
      card.addEventListener('click', () => { selectedEvent = event; renderSelectedDate(); renderEventDetail(); });
      list.appendChild(card);
    });
  }

  function appendExerciseMedia(host, item, options = {}) {
    if (item.video_url && window.AcademiaTrainingMedia) {
      window.AcademiaTrainingMedia.appendVideoPreview(host, item.video_url, options);
      return;
    }
    if (item.image_url) {
      const image = document.createElement('img');
      image.className = 'student-exercise-inline-image';
      image.src = item.image_url;
      image.alt = `Demonstração de ${item.exercise_name || 'exercício'}`;
      image.loading = 'lazy';
      host.appendChild(image);
    }
  }

  function updateLiveHero(event) {
    const startBtn = p('student-start-live-btn');
    if (!startBtn) return;
    const activeWorkout = (event && event.exercises?.length)
      ? event
      : (events || []).find((e) => e.exercises?.length) || null;

    if (!activeWorkout) {
      startBtn.classList.add('hidden');
      return;
    }

    startBtn.classList.remove('hidden');
    startBtn.onclick = () => {
      if (window.StudentLiveWorkout) {
        window.StudentLiveWorkout.start(activeWorkout);
      }
    };
  }

  function renderEventDetail() {
    const panel = p('student-event-detail-panel');
    const weekday = weekdayForDate(selectedDate);
    const dayLabel = weekdayLabel(weekday);
    if (p('student-selected-date-weekday')) p('student-selected-date-weekday').textContent = '';
    const dayTitle = p('student-selected-date-title');
    if (dayTitle) dayTitle.textContent = dayLabel;

    const planNameEl = p('student-workout-plan-name');
    const planSepEl = p('student-bc-plan-sep');
    const menuAddExercise = p('student-menu-add-exercise');
    const menuEditEvent = p('student-menu-edit-event');
    const menuDeleteEvent = p('student-menu-delete-event');

    const list = p('student-event-exercise-list');
    list.replaceChildren();
    updateLiveHero(selectedEvent);

    if (!selectedEvent) {
      panel.classList.remove('hidden');
      if (planNameEl) planNameEl.textContent = 'Descanso';
      if (planSepEl) planSepEl.classList.remove('hidden');
      if (menuAddExercise) menuAddExercise.classList.add('hidden');
      if (menuEditEvent) menuEditEvent.classList.add('hidden');
      if (menuDeleteEvent) menuDeleteEvent.classList.add('hidden');

      p('student-event-detail-title').textContent = 'Descanso';
      p('student-event-detail-time').textContent = dayLabel;
      p('student-event-detail-notes').textContent = '';
      p('student-event-detail-notes').hidden = true;

      const emptyDay = document.createElement('li');
      emptyDay.className = 'student-feed-rest-card';
      emptyDay.innerHTML = '<div class="student-feed-rest-body"><span class="student-feed-rest-icon">✦</span><strong>Dia livre ou descanso</strong><p>Nenhum treino programado para hoje.<br>Deslize horizontalmente para navegar pelos outros dias.</p></div>';
      list.appendChild(emptyDay);
      return;
    }

    panel.classList.remove('hidden');
    if (planNameEl) planNameEl.textContent = selectedEvent.title || 'Minha ficha';
    if (planSepEl) planSepEl.classList.remove('hidden');
    if (menuAddExercise) menuAddExercise.classList.toggle('hidden', Boolean(selectedEvent.is_weekly));
    if (menuEditEvent) menuEditEvent.classList.remove('hidden');
    if (menuDeleteEvent) menuDeleteEvent.classList.toggle('hidden', Boolean(selectedEvent.is_weekly));

    p('student-event-detail-title').textContent = selectedEvent.title;
    p('student-event-detail-time').textContent = `${dayLabel} · ${timeLabel(selectedEvent.start_time)}${selectedEvent.end_time ? ` - ${timeLabel(selectedEvent.end_time)}` : ''}`;
    if (selectedEvent.notes && selectedEvent.notes.trim()) {
      p('student-event-detail-notes').hidden = false;
      p('student-event-detail-notes').textContent = selectedEvent.notes;
    } else {
      p('student-event-detail-notes').hidden = true;
      p('student-event-detail-notes').textContent = '';
    }

    if (!selectedEvent.exercises.length) {
      const noExercises = document.createElement('li');
      noExercises.className = 'student-feed-rest-card';
      noExercises.innerHTML = '<div class="student-feed-rest-body"><strong>Ficha vazia</strong><p>Esta ficha ainda não possui exercícios cadastrados.<br>Toque nos três pontinhos no topo para adicionar exercícios.</p></div>';
      list.appendChild(noExercises);
      return;
    }

    selectedEvent.exercises.forEach((item, index) => {
      const card = document.createElement('li');
      card.className = 'student-feed-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'article');
      card.setAttribute('aria-label', `Exercício ${index + 1}: ${item.exercise_name || 'Exercício'}`);

      // Media container (dominant feed video/animation)
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'student-feed-media';
      appendExerciseMedia(mediaWrap, item, { controls: false });
      if (!mediaWrap.children.length) {
        mediaWrap.innerHTML = '<div class="student-feed-placeholder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 5v14M4 8h4M16 8h4M4 16h4M16 16h4M6 12h12"/></svg><span>Toque para ver demonstração</span></div>';
      }
      mediaWrap.addEventListener('click', () => openExercise(item));
      card.appendChild(mediaWrap);

      // Top floating 3-dots menu for this exercise
      const menuContainer = document.createElement('div');
      menuContainer.className = 'student-feed-item-menu';
      const dotsBtn = document.createElement('button');
      dotsBtn.type = 'button';
      dotsBtn.className = 'student-feed-dots-btn';
      dotsBtn.setAttribute('aria-label', `Opções de ${item.exercise_name || 'exercício'}`);
      dotsBtn.setAttribute('title', 'Opções do exercício');
      dotsBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';

      const menuDropdown = document.createElement('div');
      menuDropdown.className = 'student-feed-item-dropdown hidden';
      menuDropdown.innerHTML = `
        <button type="button" class="feed-item-edit-btn">Editar exercício</button>
        <button type="button" class="feed-item-delete-btn is-danger">Excluir exercício</button>
      `;

      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => {
          if (d !== menuDropdown) d.classList.add('hidden');
        });
        p('student-workout-dropdown')?.classList.add('hidden');
        menuDropdown.classList.toggle('hidden');
      });

      menuDropdown.querySelector('.feed-item-edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.add('hidden');
        openExercisePicker(item);
      });

      menuDropdown.querySelector('.feed-item-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.add('hidden');
        removeEventExercise(item);
      });

      menuContainer.append(dotsBtn, menuDropdown);
      card.appendChild(menuContainer);

      // Bottom overlay (Instagram style)
      const overlay = document.createElement('div');
      overlay.className = 'student-feed-overlay';
      overlay.addEventListener('click', () => openExercise(item));

      const primaryGroup = item.muscle_group_primary || item.muscle_group || '';
      const sets = text(item.sets || '-');
      const reps = text(item.reps || '-');
      const rest = item.rest_seconds != null ? `${text(item.rest_seconds)}s` : '-';
      const eventTime = `${timeLabel(selectedEvent.start_time)}${selectedEvent.end_time ? ` - ${timeLabel(selectedEvent.end_time)}` : ''}`;

      overlay.innerHTML = `
        <div class="student-feed-meta-row">
          <strong class="student-feed-title">${text(item.exercise_name || 'Exercício')}</strong>
          <span class="student-feed-index">${index + 1}/${selectedEvent.exercises.length}</span>
        </div>
        <div class="student-feed-badges">
          <span class="student-feed-badge primary">${sets} séries × ${reps}</span>
          <span class="student-feed-badge secondary">${rest} descanso</span>
          ${primaryGroup ? `<span class="student-feed-badge muscle">${text(primaryGroup)}</span>` : ''}
        </div>
        <div class="student-feed-caption">
          <span>${text(selectedEvent.title || 'Treino')} · ${eventTime}${selectedEvent.notes ? ` · ${text(selectedEvent.notes)}` : ''}</span>
        </div>
      `;
      card.appendChild(overlay);

      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openExercise(item);
        }
      });

      list.appendChild(card);
    });
  }

  function openExercise(item) {
    p('student-exercise-title').textContent = item.exercise_name || 'Exercício';
    p('student-exercise-subtitle').textContent = [item.muscle_group, item.is_private ? 'Exercício personalizado' : 'Catálogo da academia'].filter(Boolean).join(' · ');
    p('student-exercise-sets').textContent = item.sets || '-';
    p('student-exercise-reps').textContent = item.reps || '-';
    p('student-exercise-rest').textContent = item.rest_seconds != null ? `${item.rest_seconds}s` : '-';
    p('student-exercise-equipment').textContent = item.equipment || '-';
    p('student-exercise-primary').textContent = item.muscle_group_primary || item.muscle_group || '-';
    p('student-exercise-secondary').textContent = item.muscle_group_secondary || '-';
    p('student-exercise-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada.';
    const media = p('student-exercise-media');
    media.replaceChildren();
    appendExerciseMedia(media, item, { controls: true });
    if (!media.children.length) {
      const empty = document.createElement('span');
      empty.className = 'exercise-view-media-empty';
      empty.textContent = 'Nenhuma demonstração cadastrada.';
      media.appendChild(empty);
    }
    p('student-exercise-modal').classList.remove('hidden');
  }

  function renderExerciseResults() {
    const list = p('student-exercise-results'); list.replaceChildren();
    const action = document.createElement('button'); action.type = 'button'; action.className = 'student-exercise-result student-custom-exercise-result'; action.innerHTML = '<strong>＋ Criar exercício personalizado</strong>'; action.addEventListener('click', () => openPrivateExercise(false)); list.appendChild(action);
    const query = p('student-exercise-search').value;
    const matches = filteredCatalog(query, p('student-picker-muscle-primary')?.value, p('student-picker-muscle-secondary')?.value);
    if (!matches.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício do catálogo encontrado.'; list.appendChild(empty); return; }
    matches.forEach((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'student-exercise-result'; button.innerHTML = `<strong>${text(item.name)}</strong>`;
      button.addEventListener('click', () => pickExercise(item)); bindExercisePreview(button, item); list.appendChild(button);
    });
  }

  function addExerciseDraft(item) {
    const key = `${item.is_private ? 'private' : 'public'}:${item.id}`;
    if (!selectedExerciseDrafts.some((draft) => `${draft.is_private ? 'private' : 'public'}:${draft.id}` === key)) {
      selectedExerciseDrafts.push({ ...item, sets: 3, reps: '10-12', rest_seconds: 60, notes: '' });
    }
    p('student-event-form-exercise-list')?.classList.remove('is-open');
    renderEventExerciseOptions();
  }

  function renderEventExerciseOptions() {
    const list = p('student-event-form-exercise-list');
    const selected = p('student-event-form-selected-exercises');
    if (!list || !selected) return;
    list.replaceChildren(); selected.replaceChildren();
    const query = p('student-event-exercise-search-inline')?.value || '';
    const primary = p('student-event-muscle-primary')?.value || '';
    const secondary = p('student-event-muscle-secondary')?.value || '';
    const custom = document.createElement('button'); custom.type = 'button'; custom.className = 'student-exercise-result student-custom-exercise-result'; custom.innerHTML = '<strong>＋ Criar exercício personalizado</strong>'; custom.addEventListener('click', () => { list.classList.remove('is-open'); openPrivateExercise(true); }); list.appendChild(custom);
    filteredCatalog(query, primary, secondary).forEach((item) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'student-exercise-result'; button.innerHTML = `<strong>${text(item.name)}</strong>`; button.addEventListener('click', () => addExerciseDraft(item)); bindExercisePreview(button, item); list.appendChild(button);
    });
    if (!selectedExerciseDrafts.length) { selected.innerHTML = '<small class="student-form-hint">Nenhum exercício selecionado ainda.</small>'; return; }
    selectedExerciseDrafts.forEach((item, index) => { const chip = document.createElement('div'); chip.className = 'student-selected-exercise'; chip.innerHTML = `<span><strong>${text(item.name)}</strong><small>${text(item.muscle_group_primary || item.muscle_group || 'Exercício personalizado')}</small></span>`; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button'; remove.setAttribute('aria-label', `Remover ${item.name}`); remove.textContent = '×'; remove.addEventListener('click', () => { selectedExerciseDrafts.splice(index, 1); renderEventExerciseOptions(); }); chip.appendChild(remove); selected.appendChild(chip); });
  }

  function pickExercise(item) {
    pickedExercise = item; p('student-picked-exercise-name').textContent = item.name || item.exercise_name || 'Exercício selecionado'; p('student-event-exercise-sets').value = item.sets || 3; p('student-event-exercise-reps').value = item.reps || '10-12'; p('student-event-exercise-rest').value = item.rest_seconds ?? 60; p('student-event-exercise-notes').value = item.notes || ''; p('student-event-exercise-form').classList.remove('hidden'); p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('is-open'); setTimeout(() => p('student-event-exercise-sets').focus(), 0);
  }

  function clearPickedExercise(resetEditing = false) { pickedExercise = null; if (resetEditing) editingExerciseId = null; p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-search').disabled = false; p('student-exercise-results').classList.remove('is-open'); renderExerciseResults(); }
  function openExercisePicker(item = null) { if (!selectedEvent) { status('student-event-detail-status', 'Escolha um treino antes de adicionar exercícios.', true); return; } editingExerciseId = item?.id || null; p('student-exercise-picker-title').textContent = editingExerciseId ? 'Editar exercício do treino' : 'Exercícios do treino'; p('student-exercise-search').value = ''; p('student-exercise-search').disabled = false; p('student-exercise-results').classList.add('is-open'); p('student-event-exercise-form').classList.add('hidden'); p('student-exercise-picker-modal').classList.remove('hidden'); renderExerciseResults(); if (item) pickExercise(item); }
  function closeExercisePicker() { p('student-exercise-picker-modal').classList.add('hidden'); clearPickedExercise(true); }

  function openEventEditor(event = null) {
    p('student-event-editor-title').textContent = event ? 'Editar ficha' : 'Nova ficha';
    p('student-event-form').dataset.id = event?.id || '';
    p('student-event-title').value = event?.title || '';
    p('student-event-start').value = timeLabel(event?.start_time) || '18:00';
    p('student-event-end').value = timeLabel(event?.end_time) || '19:00';
    p('student-event-notes').value = event?.notes || '';
    p('student-event-exercise-search-inline').value = '';
    p('student-event-muscle-primary').value = '';
    p('student-event-muscle-secondary').value = '';
    activeWeekday = event ? Number(event.weekday || weekdayForDate(String(event.scheduled_date).slice(0, 10))) : weekdayForDate(selectedDate);
    weeklyExerciseDrafts = new Map();
    if (event?.is_weekly) {
      events.filter((item) => item.is_weekly).forEach((dayEvent) => weeklyExerciseDrafts.set(Number(dayEvent.weekday), (dayEvent.exercises || []).map((item) => ({ ...item, id: item.exercise_id || item.private_exercise_id || item.id, name: item.exercise_name, is_private: Boolean(item.is_private || item.private_exercise_id), sets: item.sets || 3, reps: item.reps || '10-12', rest_seconds: item.rest_seconds ?? 60, notes: item.notes || '' }))));
    } else if (event) {
      weeklyExerciseDrafts.set(activeWeekday, (event.exercises || []).map((item) => ({ ...item, id: item.exercise_id || item.private_exercise_id || item.id, name: item.exercise_name, is_private: Boolean(item.is_private || item.private_exercise_id), sets: item.sets || 3, reps: item.reps || '10-12', rest_seconds: item.rest_seconds ?? 60, notes: item.notes || '' })));
    }
    selectedExerciseDrafts = (weeklyExerciseDrafts.get(activeWeekday) || []).map((draft) => ({ ...draft }));
    privateExerciseDraftMode = false;
    renderWeekdayPicker(); renderEventExerciseOptions(); status('student-event-editor-status', ''); p('student-event-editor-modal').classList.remove('hidden');
  }
  function closeEventEditor() { p('student-event-editor-modal').classList.add('hidden'); }
  function openPrivateExercise(draftMode = false) { privateExerciseDraftMode = draftMode; if (!draftMode) closeExercisePicker(); p('student-private-exercise-form').reset(); status('student-private-exercise-status', ''); p('student-private-exercise-modal').classList.remove('hidden'); }
  function closePrivateExercise() { privateExerciseDraftMode = false; p('student-private-exercise-modal').classList.add('hidden'); }

  async function saveEvent(event) {
    event.preventDefault();
    syncActiveWeekday();
    const title = p('student-event-title').value.trim();
    const days = [...weeklyExerciseDrafts.entries()].filter(([, drafts]) => drafts.length);
    if (!title) { status('student-event-editor-status', 'Informe o nome da ficha.', true); return; }
    if (!days.length) { status('student-event-editor-status', 'Adicione pelo menos um exercício em um dia da ficha.', true); return; }
    const exercisePayload = (drafts) => drafts.map((draft) => ({ exercise_id: draft.is_private ? undefined : draft.id, private_exercise_id: draft.is_private ? draft.id : undefined, sets: draft.sets, reps: draft.reps, rest_seconds: draft.rest_seconds, notes: draft.notes }));
    try {
      const payload = {
        name: title,
        goal: p('student-event-notes').value,
        days: Array.from({ length: 7 }, (_, index) => {
          const weekday = index + 1;
          return { weekday, title: weekdayLabel(weekday), start_time: p('student-event-start').value, end_time: p('student-event-end').value || null, notes: p('student-event-notes').value, exercises: exercisePayload(weeklyExerciseDrafts.get(weekday) || []) };
        }),
      };
      await StudentPortal.api('/api/student/training/custom/plan', { method: 'POST', body: JSON.stringify(payload) });
      selectedDate = dateForWeekday(selectedDate, activeWeekday);
      closeEventEditor(); await loadCalendar(); selectedEvent = eventForDate(selectedDate).find((item) => !item.is_weekly || item.exercises?.length) || null; renderSelectedDate(); renderEventDetail();
    }
    catch (error) { status('student-event-editor-status', `Não foi possível salvar: ${error.message}`, true); }
  }

  async function removeEvent() {
    if (!selectedEvent || !window.confirm(`Remover o treino "${selectedEvent.title}"?`)) return;
    try { await StudentPortal.api('/api/student/training/calendar/event/delete', { method: 'POST', body: JSON.stringify({ id: selectedEvent.id }) }); selectedEvent = null; await loadCalendar(); } catch (error) { status('student-event-detail-status', `Não foi possível remover: ${error.message}`, true); }
  }

  async function saveEventExercise(event) {
    event.preventDefault(); if (!selectedEvent || !pickedExercise) return;
    const payload = { sets: p('student-event-exercise-sets').value, reps: p('student-event-exercise-reps').value, rest_seconds: p('student-event-exercise-rest').value, notes: p('student-event-exercise-notes').value };
    try { if (editingExerciseId) { if (pickedExercise.is_private) payload.private_exercise_id = pickedExercise.id; else payload.exercise_id = pickedExercise.id; await StudentPortal.api('/api/student/training/calendar/event/exercise/update', { method: 'POST', body: JSON.stringify({ id: editingExerciseId, ...payload }) }); } else { payload.event_id = selectedEvent.id; if (pickedExercise.is_private) payload.private_exercise_id = pickedExercise.id; else payload.exercise_id = pickedExercise.id; await StudentPortal.api('/api/student/training/calendar/event/exercise', { method: 'POST', body: JSON.stringify(payload) }); } closeExercisePicker(); await loadCalendar(); } catch (error) { status('student-exercise-picker-status', `Não foi possível salvar: ${error.message}`, true); }
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
    event.preventDefault(); if (!selectedEvent && !privateExerciseDraftMode) return;
    try {
      const file = p('student-private-image-file').files?.[0];
      const imageUrl = file ? await uploadImage(file) : p('student-private-image-url').value.trim();
      const created = await StudentPortal.api('/api/student/training/custom/private-exercise', { method: 'POST', body: JSON.stringify({ name: p('student-private-name').value, muscle_group_primary: p('student-private-primary').value, muscle_group_secondary: p('student-private-secondary').value, equipment: p('student-private-equipment').value, image_url: imageUrl, video_url: p('student-private-video').value, instructions: p('student-private-instructions').value }) });
      if (privateExerciseDraftMode) { selectedExerciseDrafts.push({ ...created, is_private: true, sets: 3, reps: '10-12', rest_seconds: 60, notes: '' }); privateExerciseDraftMode = false; closePrivateExercise(); renderEventExerciseOptions(); return; }
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

  function weeklyDetailToEvents(detail) {
    const plan = detail?.plan || {};
    return (detail?.days || []).map((day) => ({
      id: day.id,
      plan_id: plan.id,
      weekday: Number(day.weekday),
      title: plan.name || 'Minha ficha',
      scheduled_date: dateForWeekday(selectedDate, Number(day.weekday)),
      start_time: timeLabel(day.start_time) || '18:00',
      end_time: timeLabel(day.end_time) || '19:00',
      notes: day.notes || plan.goal || '',
      is_weekly: true,
      editable: plan.editable !== false,
      exercises: (detail.exercises || []).filter((item) => Number(item.weekday) === Number(day.weekday)).map((item) => ({ ...item, id: item.id, exercise_id: item.exercise_library_id, private_exercise_id: item.private_exercise_id, is_private: Boolean(item.is_private || item.private_exercise_id) })),
    }));
  }

  async function loadCalendar() {
    try {
      const previousEventId = selectedEvent?.id;
      try {
        const current = await StudentPortal.api('/api/student/training/current');
        events = weeklyDetailToEvents(current);
      } catch (currentError) {
        const result = await StudentPortal.api(`/api/student/training/calendar?month=${encodeURIComponent(currentMonth())}`);
        events = result.events || [];
      }
      const dayEvents = eventForDate(selectedDate).filter((event) => !event.is_weekly || event.exercises?.length); selectedEvent = dayEvents.find((event) => event.id === previousEventId) || dayEvents[0] || null; renderSelectedDate(); renderEventDetail(); status('student-calendar-status', '');
    } catch (error) { status('student-portal-status', `Não foi possível carregar seus treinos: ${error.message}`, true); }
  }

  async function moveDay(offset) {
    const list = p('student-event-exercise-list');
    if (list) {
      list.classList.add('student-day-transition');
      setTimeout(() => list.classList.remove('student-day-transition'), 180);
    }
    const date = fromDateKey(selectedDate);
    date.setDate(date.getDate() + offset);
    selectedDate = toDateKey(date);
    selectedEvent = null;
    await loadCalendar();
  }

  function initSwipeGestures() {
    const workspace = p('student-event-detail-panel') || document.querySelector('.student-training-workspace');
    if (!workspace) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    workspace.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    workspace.addEventListener('touchend', (event) => {
      if (!touchStartTime) return;
      const touchEndX = event.changedTouches[0].clientX;
      const touchEndY = event.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      const duration = Date.now() - touchStartTime;
      touchStartTime = 0;

      if (event.target.closest('.modal:not(.hidden), input, select, textarea, button:not(.student-day-arrow)')) {
        if (Math.abs(diffX) < 45) return;
      }

      if (duration < 600 && Math.abs(diffX) >= 38 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
        if (diffX < 0) {
          moveDay(1);
        } else {
          moveDay(-1);
        }
      }
    }, { passive: true });
  }

  async function openMyPlan() {
    if (!events.length) await loadCalendar();
    const planEvent = events.find((event) => event.is_weekly && event.exercises?.length) || events.find((event) => event.exercises?.length);
    if (!planEvent) { status('student-portal-status', 'Nenhuma ficha cadastrada no momento.', true); return; }
    selectedDate = String(planEvent.scheduled_date).slice(0, 10);
    selectedEvent = planEvent;
    renderSelectedDate(); renderEventDetail();
    p('student-event-detail-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function load() {
    try { revealTrainingContent(); await StudentPortal.init(); const me = await StudentPortal.api('/api/student/me'); p('student-portal-title').textContent = `Meu treino, ${(me.name || 'Aluno').split(' ')[0]}`; const result = await StudentPortal.api('/api/student/training/catalog'); catalog = [...(result.public || []).map((item) => ({ ...item, is_private: false })), ...(result.private || []).map((item) => ({ ...item, is_private: true }))]; populateMuscleFilters(); await Promise.all([loadCalendar(), loadApprovedAnalysis()]); }
    catch (error) { status('student-portal-status', `Erro: ${error.message}`, true); }
    finally { revealTrainingContent(); }
  }

  on('student-day-previous', 'click', () => moveDay(-1)); on('student-day-next', 'click', () => moveDay(1)); on('student-my-plan-button', 'click', openMyPlan); on('student-new-event-button', 'click', () => openEventEditor());
  on('student-event-exercise-search-inline', 'focus', () => { p('student-event-form-exercise-list')?.classList.add('is-open'); renderEventExerciseOptions(); });
  on('student-event-exercise-search-inline', 'input', () => { p('student-event-form-exercise-list')?.classList.add('is-open'); renderEventExerciseOptions(); });
  on('student-event-exercise-search-inline', 'blur', () => setTimeout(() => { const list = p('student-event-form-exercise-list'); if (list && !list.contains(document.activeElement)) list.classList.remove('is-open'); }, 120));
  ['student-event-muscle-primary', 'student-event-muscle-secondary'].forEach((id) => on(id, 'change', () => { p('student-event-form-exercise-list')?.classList.add('is-open'); renderEventExerciseOptions(); }));
  ['student-picker-muscle-primary', 'student-picker-muscle-secondary'].forEach((id) => on(id, 'change', () => { p('student-exercise-results')?.classList.add('is-open'); renderExerciseResults(); }));
  document.querySelectorAll('#student-weekday-picker [data-weekday]').forEach((button) => button.addEventListener('click', () => selectWeekday(button.dataset.weekday)));
  on('student-event-form', 'submit', saveEvent); on('student-event-editor-close', 'click', closeEventEditor); on('student-event-editor-cancel', 'click', closeEventEditor); on('student-edit-event-button', 'click', () => openEventEditor(selectedEvent)); on('student-add-event-exercise-button', 'click', () => openExercisePicker()); on('student-import-calendar-button', 'click', importToCalendar); on('student-delete-event-button', 'click', removeEvent);
  on('student-exercise-search', 'focus', () => { p('student-exercise-results')?.classList.add('is-open'); renderExerciseResults(); }); on('student-exercise-search', 'input', () => { p('student-exercise-results')?.classList.add('is-open'); renderExerciseResults(); }); on('student-exercise-search', 'blur', () => setTimeout(() => { const list = p('student-exercise-results'); if (list && !list.contains(document.activeElement)) list.classList.remove('is-open'); }, 120)); on('student-event-exercise-form', 'submit', saveEventExercise); on('student-clear-picked-exercise', 'click', () => clearPickedExercise(false)); on('student-exercise-picker-close', 'click', closeExercisePicker); on('student-private-exercise-form', 'submit', savePrivateExercise); on('student-private-exercise-close', 'click', closePrivateExercise); on('student-private-exercise-cancel', 'click', closePrivateExercise); on('student-exercise-close', 'click', () => p('student-exercise-modal')?.classList.add('hidden'));
  [p('student-event-editor-modal'), p('student-exercise-picker-modal'), p('student-private-exercise-modal'), p('student-exercise-modal')].filter(Boolean).forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); }));
  function initWorkoutMenu() {
    const trigger = p('student-workout-menu-btn');
    const dropdown = p('student-workout-dropdown');
    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => d.classList.add('hidden'));
      const isHidden = dropdown.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', String(!isHidden));
    });

    on('student-menu-add-exercise', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openExercisePicker();
    });
    on('student-menu-edit-event', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openEventEditor(selectedEvent);
    });
    on('student-menu-new-event', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openEventEditor();
    });
    on('student-menu-my-plan', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      openMyPlan();
    });
    on('student-menu-import-calendar', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      importToCalendar();
    });
    on('student-menu-delete-event', 'click', () => {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      removeEvent();
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
      document.querySelectorAll('.student-feed-item-dropdown:not(.hidden)').forEach((d) => {
        if (!d.contains(e.target) && !e.target.closest('.student-feed-dots-btn')) {
          d.classList.add('hidden');
        }
      });
    });
  }

  window.StudentWorkout = { getEvents: () => events };
  initSwipeGestures();
  initWorkoutMenu();
  load();
}());
