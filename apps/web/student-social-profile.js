(function () {
  const p = (id) => document.getElementById(id);
  const esc = (value) => StudentPortal.escapeHtml(value ?? '');
  const initials = (name) => String(name || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
  let selectedDate = toDateKey(new Date());
  let currentTraining = null;
  let currentProfile = null;
  let editorPhotoPreview = '';

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function fromDateKey(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function weekdayForDate(value) {
    const day = fromDateKey(value).getDay();
    return day === 0 ? 7 : day;
  }

  function updateProfileDayLabel() {
    const date = fromDateKey(selectedDate);
    const label = p('social-profile-day-label');
    if (label) label.textContent = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function setStatus(message, error = false) {
    const element = p('social-profile-page-status');
    element.textContent = message || '';
    element.classList.toggle('error', error);
  }

  function hasMeasurement(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function measurement(value, suffix = '') {
    if (!hasMeasurement(value) || !Number.isFinite(Number(value))) return '-';
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
  }

  function profileDate(value) {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
  }

  function renderStartSummary(progress, isOwnProfile) {
    const section = p('social-profile-start-summary');
    const baseline = progress?.baseline || progress?.assessments?.at(-1) || null;
    if (!isOwnProfile || !baseline) {
      section.hidden = true;
      return;
    }
    const assessments = progress.assessments || [];
    const current = assessments.find((item) => hasMeasurement(item.weight_kg)) || baseline;
    const startWeight = Number(baseline.weight_kg);
    const currentWeight = Number(current.weight_kg);
    const difference = hasMeasurement(baseline.weight_kg) && hasMeasurement(current.weight_kg) && Number.isFinite(startWeight) && Number.isFinite(currentWeight)
      ? Number((currentWeight - startWeight).toFixed(2))
      : null;
    const differenceText = difference === null ? '-' : difference === 0 ? 'Mantido' : `${difference > 0 ? '+' : ''}${measurement(difference, ' kg')}`;
    const cards = [
      ['Peso inicial', measurement(baseline.weight_kg, ' kg')],
      ['Peso atual', measurement(current.weight_kg, ' kg')],
      ['Diferença total', differenceText],
      ['Altura inicial', measurement(baseline.height_cm, ' cm')]
    ];
    p('social-profile-start-grid').innerHTML = cards.map(([label, value]) => `<div class="social-profile-start-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    const date = profileDate(baseline.assessment_date);
    p('social-profile-start-date').textContent = date ? `Início registrado em ${date}.` : '';
    section.hidden = false;
  }

  function fillAvatar(profile) {
    const host = p('social-profile-page-avatar');
    host.replaceChildren();
    if (profile.profile_photo_url) {
      const image = document.createElement('img');
      image.src = profile.profile_photo_url;
      image.alt = '';
      image.loading = 'lazy';
      host.appendChild(image);
    } else {
      host.textContent = initials(profile.name);
    }
  }

  function fillEditorAvatar(profile, previewUrl = '') {
    const host = p('social-profile-editor-avatar');
    host.replaceChildren();
    const photoUrl = previewUrl || profile?.profile_photo_url;
    if (photoUrl) {
      const image = document.createElement('img');
      image.src = photoUrl;
      image.alt = '';
      host.appendChild(image);
    } else {
      host.textContent = initials(profile?.name);
    }
  }

  function renderProfile(profile) {
    p('social-profile-page-name').textContent = profile.name || 'Aluno';
    p('social-profile-page-visibility').textContent = profile.is_private ? 'Perfil privado' : 'Perfil público';
    p('social-profile-page-bio').textContent = profile.bio || '';
    p('social-profile-page-followers').textContent = profile.followers_count || 0;
    p('social-profile-page-following').textContent = profile.following_count || 0;
    fillAvatar(profile);

    const link = p('social-profile-page-link');
    link.hidden = !profile.website_url;
    link.href = profile.website_url || '#';
    link.textContent = profile.website_url || '';
  }

  async function uploadProfilePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha JPG, PNG ou WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A foto não pode ultrapassar 5 MB.');
    const form = new FormData();
    form.append('file', file, file.name);
    const response = await fetch(`${StudentPortal.apiBase}/api/editor/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${StudentPortal.getToken()}` },
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a foto.');
    return data.location || '';
  }

  function openProfileEditor() {
    if (!currentProfile) return;
    p('social-profile-editor-name').value = currentProfile.name || '';
    p('social-profile-editor-bio').value = currentProfile.bio || '';
    p('social-profile-editor-link').value = currentProfile.website_url || '';
    p('social-profile-editor-private').checked = Boolean(currentProfile.is_private);
    p('social-profile-editor-photo').value = '';
    p('social-profile-editor-status').textContent = '';
    fillEditorAvatar(currentProfile);
    p('social-profile-editor-modal').classList.remove('hidden');
    p('social-profile-editor-name').focus();
  }

  function closeProfileEditor() {
    p('social-profile-editor-modal').classList.add('hidden');
    if (editorPhotoPreview) URL.revokeObjectURL(editorPhotoPreview);
    editorPhotoPreview = '';
  }

  async function saveProfileEditor(event) {
    event.preventDefault();
    const button = p('social-profile-editor-save');
    const status = p('social-profile-editor-status');
    try {
      button.disabled = true;
      status.textContent = '';
      status.classList.remove('error');
      const file = p('social-profile-editor-photo').files?.[0];
      const photo = file ? await uploadProfilePhoto(file) : currentProfile.profile_photo_url || '';
      const result = await StudentPortal.api('/api/student/social/profile', {
        method: 'POST',
        body: JSON.stringify({
          name: p('social-profile-editor-name').value.trim(),
          bio: p('social-profile-editor-bio').value.trim(),
          website_url: p('social-profile-editor-link').value.trim(),
          profile_photo_url: photo,
          is_private: p('social-profile-editor-private').checked,
          weight_unit: currentProfile.weight_unit || 'kg',
          distance_unit: currentProfile.distance_unit || 'km',
          theme: currentProfile.theme || 'light',
          language: currentProfile.language || 'pt-BR'
        })
      });
      currentProfile = result.profile;
      renderProfile(currentProfile);
      localStorage.setItem('studentName', currentProfile.name || 'Aluno');
      document.querySelectorAll('[data-student-name]').forEach((element) => { element.textContent = currentProfile.name || 'Aluno'; });
      document.querySelectorAll('[data-student-avatar]').forEach((element) => { element.textContent = initials(currentProfile.name).charAt(0); });
      closeProfileEditor();
      setStatus('Perfil atualizado.');
    } catch (error) {
      status.textContent = `Não foi possível salvar: ${error.message}`;
      status.classList.add('error');
    } finally {
      button.disabled = false;
    }
  }

  function createWorkoutCard(training, includeOpenButton = false, dateKey = selectedDate) {
    if (!training?.plan) return null;

    const card = document.createElement('div');
    card.className = 'social-profile-workout-card';
    card.innerHTML = `<strong>${esc(training.plan.name)}</strong><small>${esc(training.plan.goal || 'Objetivo não informado')} · ${esc(training.plan.level || 'Nível não informado')}</small>`;

    const exercises = document.createElement('ul');
    exercises.className = 'social-profile-exercises';
    const weekday = weekdayForDate(dateKey);
    const dayExercises = (training.exercises || []).filter((exercise) => !exercise.weekday || Number(exercise.weekday) === weekday).slice(0, 8);
    dayExercises.forEach((exercise) => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${esc(exercise.exercise_name || 'Exercício')}</span><small>${esc(exercise.sets || 0)} séries · ${esc(exercise.reps || '-')}</small>`;
      exercises.appendChild(item);
    });
    if (exercises.children.length) {
      card.appendChild(exercises);
    } else {
      const empty = document.createElement('span');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhum exercício programado para este dia.';
      card.appendChild(empty);
    }

    if (includeOpenButton) {
      const button = document.createElement('button');
      button.className = 'button secondary';
      button.type = 'button';
      button.textContent = 'Abrir meu treino';
      button.addEventListener('click', () => openTrainingModal(training, dateKey));
      card.appendChild(button);
    }
    return card;
  }

  function renderWorkout(training, dateKey = selectedDate) {
    const host = p('social-profile-workout');
    host.replaceChildren();
    const card = createWorkoutCard(training, true, dateKey);
    if (!card) {
      const empty = document.createElement('p');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhuma ficha atual cadastrada.';
      host.appendChild(empty);
      return;
    }
    host.appendChild(card);
  }

  function openTrainingModal(training, dateKey = selectedDate) {
    const modal = p('social-profile-training-modal');
    const content = p('social-profile-training-modal-content');
    content.replaceChildren();
    const card = createWorkoutCard(training, false, dateKey);
    if (card) content.appendChild(card);

    const actions = document.createElement('div');
    actions.className = 'social-profile-modal-actions';
    const editLink = document.createElement('a');
    editLink.className = 'button';
    editLink.href = './student-portal.html';
    editLink.textContent = 'Editar ficha';
    actions.appendChild(editLink);
    content.appendChild(actions);

    modal.classList.remove('hidden');
    p('social-profile-training-close')?.focus();
  }

  function closeTrainingModal() {
    p('social-profile-training-modal')?.classList.add('hidden');
  }

  function renderPosts(posts) {
    const host = p('social-profile-posts');
    host.replaceChildren();
    if (!posts.length) {
      const empty = document.createElement('p');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhuma publicação ainda.';
      host.appendChild(empty);
      return;
    }
    posts.slice(0, 9).forEach((post) => {
      const tile = document.createElement('div');
      tile.className = 'social-profile-post-tile';
      if (post.media_url && post.media_type === 'image') {
        const image = document.createElement('img');
        image.src = post.media_url;
        image.alt = 'Publicação';
        image.loading = 'lazy';
        tile.appendChild(image);
      } else if (post.media_url && post.media_type === 'video' && post.media_url.startsWith('/uploads/')) {
        const video = document.createElement('video');
        video.src = post.media_url;
        video.muted = true;
        video.controls = true;
        video.preload = 'metadata';
        tile.appendChild(video);
      } else {
        tile.textContent = post.caption || 'Publicação';
      }
      host.appendChild(tile);
    });
  }

  function formatAssessmentDate(value, withYear = false) {
    if (!value) return '-';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR', withYear ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' });
  }

  function renderChart(assessments) {
    const host = p('social-profile-chart');
    host.replaceChildren();
    host.classList.remove('is-line-chart');
    const items = assessments.filter((item) => formatAssessmentDate(item.assessment_date) !== '-').slice(0, 12).reverse();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhuma avaliação registrada ainda.';
      host.appendChild(empty);
      return;
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    const width = 760;
    const height = 220;
    const plot = { left: 42, right: 14, top: 16, bottom: 42 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Gráfico de evolução por data');

    const makeSvg = (name, attributes = {}) => {
      const element = document.createElementNS(svgNS, name);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      return element;
    };
    const xFor = (index) => plot.left + (items.length === 1 ? plotWidth / 2 : (index / (items.length - 1)) * plotWidth);
    const addText = (text, attributes) => {
      const element = makeSvg('text', attributes);
      element.textContent = text;
      svg.appendChild(element);
    };

    for (let index = 0; index <= 4; index += 1) {
      const y = plot.top + (index / 4) * plotHeight;
      svg.appendChild(makeSvg('line', { x1: plot.left, y1: y, x2: width - plot.right, y2: y, class: 'chart-grid-line' }));
    }

    const series = [
      { key: 'weight_kg', className: 'is-weight', label: 'Peso' },
      { key: 'body_fat_percent', className: 'is-fat', label: 'Gordura corporal' }
    ];
    series.forEach((definition) => {
      const values = items.map((item, index) => ({ index, value: Number(item[definition.key]) })).filter((item) => Number.isFinite(item.value));
      if (!values.length) return;
      const min = Math.min(...values.map((item) => item.value));
      const max = Math.max(...values.map((item) => item.value));
      const spread = Math.max(1, max - min);
      const points = values.map((item) => `${xFor(item.index)},${plot.top + plotHeight - ((item.value - min) / spread) * plotHeight}`).join(' ');
      if (values.length > 1) svg.appendChild(makeSvg('polyline', { points, class: `chart-line ${definition.className}` }));
      values.forEach((item) => {
        const y = plot.top + plotHeight - ((item.value - min) / spread) * plotHeight;
        const circle = makeSvg('circle', { cx: xFor(item.index), cy: y, r: 4, class: `chart-point ${definition.className}` });
        const title = makeSvg('title');
        title.textContent = `${definition.label}: ${item.value} · ${formatAssessmentDate(items[item.index].assessment_date, true)}`;
        circle.appendChild(title);
        svg.appendChild(circle);
      });
      addText(`${min}`, { x: 4, y: plot.top + plotHeight + 4, class: 'chart-axis-label' });
      addText(`${max}`, { x: 4, y: plot.top + 4, class: 'chart-axis-label' });
    });

    const labelStep = items.length > 8 ? Math.ceil(items.length / 8) : 1;
    items.forEach((item, index) => {
      if (index % labelStep !== 0 && index !== items.length - 1) return;
      addText(formatAssessmentDate(item.assessment_date, true), { x: xFor(index), y: height - 12, class: 'chart-date-label', 'text-anchor': 'middle' });
    });
    host.classList.add('is-line-chart');
    const chart = document.createElement('div');
    chart.className = 'social-profile-line-chart';
    chart.appendChild(svg);
    host.appendChild(chart);
  }

  function changeProfileDay(offset) {
    const date = fromDateKey(selectedDate);
    date.setDate(date.getDate() + offset);
    selectedDate = toDateKey(date);
    updateProfileDayLabel();
    renderWorkout(currentTraining, selectedDate);
  }

  async function load() {
    try {
      await StudentPortal.init();
      const queryMember = new URLSearchParams(window.location.search).get('member_id');
      const [current, progress] = await Promise.all([
        StudentPortal.api('/api/student/social/profile'),
        StudentPortal.api('/api/student/progress').catch(() => null)
      ]);
      const memberId = queryMember || current.profile.id;
      const result = queryMember ? await StudentPortal.api(`/api/student/social/profile?member_id=${encodeURIComponent(queryMember)}`) : current;
      const profile = result.profile;
      const isOwnProfile = String(memberId) === String(current.profile.id);
      currentProfile = isOwnProfile ? profile : null;
      renderProfile(profile);
      renderStartSummary(progress, isOwnProfile);
      if (!isOwnProfile) document.querySelector('.social-profile-edit-button')?.remove();

      if (profile.restricted) {
        return;
      }
    } catch (error) {
      setStatus(`Não foi possível carregar o perfil: ${error.message}`, true);
    }
  }

  p('social-profile-edit-open')?.addEventListener('click', openProfileEditor);
  p('social-profile-editor-close')?.addEventListener('click', closeProfileEditor);
  p('social-profile-editor-cancel')?.addEventListener('click', closeProfileEditor);
  p('social-profile-editor-form')?.addEventListener('submit', saveProfileEditor);
  p('social-profile-editor-avatar')?.addEventListener('click', () => p('social-profile-editor-photo').click());
  p('social-profile-editor-avatar')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      p('social-profile-editor-photo').click();
    }
  });
  p('social-profile-editor-photo')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (editorPhotoPreview) URL.revokeObjectURL(editorPhotoPreview);
    editorPhotoPreview = URL.createObjectURL(file);
    fillEditorAvatar(currentProfile, editorPhotoPreview);
  });
  p('social-profile-editor-modal')?.addEventListener('click', (event) => {
    if (event.target === p('social-profile-editor-modal')) closeProfileEditor();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !p('social-profile-editor-modal')?.classList.contains('hidden')) closeProfileEditor();
  });
  load();
}());
