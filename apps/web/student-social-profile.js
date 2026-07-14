(function () {
  const p = (id) => document.getElementById(id);
  const esc = (value) => StudentPortal.escapeHtml(value ?? '');
  const initials = (name) => String(name || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
  let selectedDate = toDateKey(new Date());
  let currentTraining = null;

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
      const current = await StudentPortal.api('/api/student/social/profile');
      const memberId = queryMember || current.profile.id;
      const result = queryMember ? await StudentPortal.api(`/api/student/social/profile?member_id=${encodeURIComponent(queryMember)}`) : current;
      const profile = result.profile;
      const isOwnProfile = String(memberId) === String(current.profile.id);
      p('social-profile-page-name').textContent = profile.name || 'Aluno';
      p('social-profile-page-visibility').textContent = profile.is_private ? 'Perfil privado' : 'Perfil público';
      p('social-profile-page-bio').textContent = profile.bio || '';
      p('social-profile-page-posts').textContent = profile.posts_count || 0;
      p('social-profile-page-followers').textContent = profile.followers_count || 0;
      p('social-profile-page-following').textContent = profile.following_count || 0;
      fillAvatar(profile);

      const link = p('social-profile-page-link');
      link.hidden = !profile.website_url;
      link.href = profile.website_url || '#';
      link.textContent = profile.website_url || '';

      const stats = result.stats || {};
      p('social-profile-completed').textContent = stats.completed_training_count || 0;
      p('social-profile-exercises').textContent = stats.planned_exercise_count || 0;
      p('social-profile-checkins').textContent = stats.checkins_count || 0;
      p('social-profile-scheduled').textContent = stats.scheduled_training_count || 0;

      const progress = isOwnProfile ? await StudentPortal.api('/api/student/progress').catch(() => ({ assessments: [] })) : { assessments: [] };
      renderChart(progress.assessments || []);
      if (profile.restricted) {
        p('social-profile-workout').textContent = 'Este perfil é privado.';
        p('social-profile-posts').textContent = 'Este perfil é privado.';
        return;
      }

      currentTraining = isOwnProfile ? await StudentPortal.api('/api/student/training/current').catch(() => null) : null;
      updateProfileDayLabel();
      renderWorkout(currentTraining, selectedDate);
      renderPosts(result.posts || []);
      if (!isOwnProfile) document.querySelectorAll('.social-profile-page-actions a:first-child').forEach((element) => element.remove());
    } catch (error) {
      setStatus(`Não foi possível carregar o perfil: ${error.message}`, true);
    }
  }

  p('social-profile-day-previous')?.addEventListener('click', () => changeProfileDay(-1));
  p('social-profile-day-next')?.addEventListener('click', () => changeProfileDay(1));
  p('social-profile-training-close')?.addEventListener('click', closeTrainingModal);
  p('social-profile-training-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeTrainingModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTrainingModal();
  });
  load();
}());
