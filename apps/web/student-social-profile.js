(function () {
  const p = (id) => document.getElementById(id);
  const esc = (value) => StudentPortal.escapeHtml(value ?? '');
  const initials = (name) => String(name || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';

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

  function createWorkoutCard(training, includeOpenButton = false) {
    if (!training?.plan) return null;

    const card = document.createElement('div');
    card.className = 'social-profile-workout-card';
    card.innerHTML = `<strong>${esc(training.plan.name)}</strong><small>${esc(training.plan.goal || 'Objetivo não informado')} · ${esc(training.plan.level || 'Nível não informado')}</small>`;

    const exercises = document.createElement('ul');
    exercises.className = 'social-profile-exercises';
    (training.exercises || []).slice(0, 8).forEach((exercise) => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${esc(exercise.exercise_name || 'Exercício')}</span><small>${esc(exercise.sets || 0)} séries · ${esc(exercise.reps || '-')}</small>`;
      exercises.appendChild(item);
    });
    if (exercises.children.length) card.appendChild(exercises);

    if (includeOpenButton) {
      const button = document.createElement('button');
      button.className = 'button secondary';
      button.type = 'button';
      button.textContent = 'Abrir meu treino';
      button.addEventListener('click', () => openTrainingModal(training));
      card.appendChild(button);
    }
    return card;
  }

  function renderWorkout(training) {
    const host = p('social-profile-workout');
    host.replaceChildren();
    const card = createWorkoutCard(training, true);
    if (!card) {
      const empty = document.createElement('p');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhuma ficha atual cadastrada.';
      host.appendChild(empty);
      return;
    }
    host.appendChild(card);
  }

  function openTrainingModal(training) {
    const modal = p('social-profile-training-modal');
    const content = p('social-profile-training-modal-content');
    content.replaceChildren();
    const card = createWorkoutCard(training);
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

  function formatAssessmentDate(value) {
    if (!value) return '-';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function renderChart(assessments) {
    const host = p('social-profile-chart');
    host.replaceChildren();
    const items = assessments.slice(0, 6).reverse();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'social-profile-empty';
      empty.textContent = 'Nenhuma avaliação registrada ainda.';
      host.appendChild(empty);
      return;
    }

    const weights = items.map((item) => Number(item.weight_kg)).filter(Number.isFinite);
    const fats = items.map((item) => Number(item.body_fat_percent)).filter(Number.isFinite);
    const weightMin = Math.min(...weights, 0);
    const weightMax = Math.max(...weights, 1);
    const fatMin = Math.min(...fats, 0);
    const fatMax = Math.max(...fats, 1);
    items.forEach((item) => {
      const column = document.createElement('div');
      column.className = 'social-profile-chart-column';
      const bars = document.createElement('div');
      bars.className = 'social-profile-chart-bars';
      const weight = Number(item.weight_kg);
      const fat = Number(item.body_fat_percent);
      const weightBar = document.createElement('span');
      weightBar.className = 'social-profile-chart-bar';
      weightBar.style.height = `${Math.max(5, ((weight - weightMin) / Math.max(1, weightMax - weightMin)) * 100)}%`;
      weightBar.title = Number.isFinite(weight) ? `${weight} kg` : 'Peso não informado';
      const fatBar = document.createElement('span');
      fatBar.className = 'social-profile-chart-bar is-fat';
      fatBar.style.height = `${Math.max(5, ((fat - fatMin) / Math.max(1, fatMax - fatMin)) * 100)}%`;
      fatBar.title = Number.isFinite(fat) ? `${fat}%` : 'Gordura não informada';
      bars.append(weightBar, fatBar);
      column.appendChild(bars);
      const date = document.createElement('small');
      date.textContent = formatAssessmentDate(item.assessment_date);
      column.appendChild(date);
      host.appendChild(column);
    });
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

      const training = isOwnProfile ? await StudentPortal.api('/api/student/training/current').catch(() => null) : null;
      renderWorkout(training);
      renderPosts(result.posts || []);
      if (!isOwnProfile) document.querySelectorAll('.social-profile-page-actions a:first-child').forEach((element) => element.remove());
    } catch (error) {
      setStatus(`Não foi possível carregar o perfil: ${error.message}`, true);
    }
  }

  p('social-profile-training-close')?.addEventListener('click', closeTrainingModal);
  p('social-profile-training-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeTrainingModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTrainingModal();
  });
  load();
}());
