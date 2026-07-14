const trainingHost = window.location.hostname || 'localhost';
const TRAINING_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${trainingHost}:3004`;
const trainingToken = localStorage.getItem('academiaToken') || '';
let members = [];
let exercises = [];
let plans = [];
let days = [];
let trainingLevels = [];
let editingExerciseId = null;
let editingOriginalVideoUrl = '';

const t = (id) => document.getElementById(id);

function setTrainingStatus(text) {
  t('training-status').textContent = text;
}

async function api(path, options = {}) {
  const headers = {
    Authorization: `Bearer ${trainingToken}`,
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${TRAINING_API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function fillSelect(id, rows, label, empty) {
  const select = t(id);
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = empty;
  select.appendChild(first);
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = label(row);
    select.appendChild(option);
  }
}

const defaultTrainingLevels = [
  { slug: 'frango', name: 'Frango', is_active: true },
  { slug: 'intermediario', name: 'Intermediario', is_active: true },
  { slug: 'avancado', name: 'Avancado', is_active: true }
];

function fillLevelSelect(id) {
  const select = t(id);
  const selected = select.value;
  const activeLevels = (trainingLevels.length ? trainingLevels : defaultTrainingLevels).filter((level) => level.is_active !== false);
  select.innerHTML = '';
  for (const level of activeLevels) {
    const option = document.createElement('option');
    option.value = level.slug;
    option.textContent = level.name;
    option.selected = level.slug === selected;
    select.appendChild(option);
  }
  if (!activeLevels.some((level) => level.slug === selected) && activeLevels[0]) select.value = activeLevels[0].slug;
}

function canManageTrainingLevels() {
  if (['owner', 'admin'].includes(localStorage.getItem('academiaRole'))) return true;
  try { return JSON.parse(localStorage.getItem('academiaAccessPermissions') || '{}').training === true; } catch (_) { return false; }
}

function setTrainingLevelStatus(text) {
  t('training-level-status').textContent = text;
}

function renderTrainingLevels() {
  const panel = t('training-levels-panel');
  const list = t('training-level-list');
  if (!canManageTrainingLevels()) {
    panel.hidden = true;
    t('open-training-levels-button')?.setAttribute('hidden', 'hidden');
    return;
  }
  panel.hidden = false;
  t('open-training-levels-button')?.removeAttribute('hidden');
  list.innerHTML = '';
  for (const level of trainingLevels) {
    const item = document.createElement('li');
    const form = document.createElement('form');
    form.className = 'training-level-row';
    const input = document.createElement('input');
    input.value = level.name;
    input.maxLength = 60;
    input.required = true;
    input.setAttribute('aria-label', `Nome do nivel ${level.name}`);
    const activeLabel = document.createElement('label');
    activeLabel.className = 'training-level-active';
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = level.is_active;
    activeLabel.append(active, document.createTextNode(' Ativo'));
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'mini-button';
    save.textContent = 'Salvar';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini-button secondary';
    remove.textContent = 'Excluir';
    remove.title = 'Excluir este nível';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o nível "${level.name}"?`)) return;
      remove.disabled = true;
      try {
        await api('/api/training/levels', { method: 'DELETE', body: JSON.stringify({ id: level.id }) });
        setTrainingLevelStatus('Nível excluído.');
        await loadBase();
      } catch (error) {
        const message = error.message === 'nivel_em_uso' ? 'Esse nível já está sendo usado. Desative-o para não aparecer em novos cadastros.' : `Erro: ${error.message}`;
        setTrainingLevelStatus(message);
      } finally {
        remove.disabled = false;
      }
    });
    form.append(input, activeLabel, save, remove);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await api('/api/training/levels/update', {
          method: 'POST',
          body: JSON.stringify({ id: level.id, name: input.value.trim(), is_active: active.checked })
        });
        setTrainingLevelStatus('Nivel atualizado.');
        await loadBase();
      } catch (error) {
        setTrainingLevelStatus(`Erro: ${error.message}`);
      } finally {
        save.disabled = false;
      }
    });
    item.appendChild(form);
    list.appendChild(item);
  }
}

async function loadBase() {
  if (!trainingToken) {
    setTrainingStatus('Entre no painel principal antes de acessar treinos.');
    return;
  }
  const memberResult = await api('/api/members');
  const exerciseResult = await api('/api/training/exercises');
  const planResult = await api('/api/training/plans');
  const levelResult = await api('/api/training/levels');
  members = memberResult.data || [];
  exercises = exerciseResult.data || [];
  plans = planResult.data || [];
  trainingLevels = levelResult.data || [];
  renderAll();
  setTrainingStatus('');
}

function renderAll() {
  fillLevelSelect('exercise-level');
  fillLevelSelect('profile-level');
  fillLevelSelect('plan-level');
  fillSelect('profile-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('plan-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('exercise-select', exercises, (e) => `${e.name} - ${e.muscle_group_primary || e.muscle_group}`, 'Selecione o exercicio');
  fillSelect('day-plan', plans, (p) => `${p.member_name} - ${p.name}`, 'Selecione a ficha');
  fillSelect('review-plan', plans, (p) => `${p.member_name} - ${p.name} (${p.age_days || 0} dias)`, 'Selecione a ficha');
  renderTrainingLevels();

  const exerciseList = t('exercise-list');
  exerciseList.innerHTML = '';
  for (const item of exercises) {
    const row = document.createElement('li');
    row.className = 'entity-card';
    if (item.is_active === false) row.classList.add('is-inactive');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver como fazer ${item.name}`);
    row.addEventListener('click', () => openExerciseDetails(item));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openExerciseDetails(item); } });
    const main = document.createElement('div');
    main.className = 'entity-main';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const detail = document.createElement('span');
    const level = trainingLevels.find((candidate) => candidate.slug === item.level);
    const primaryMuscle = item.muscle_group_primary || item.muscle_group || 'Músculo não informado';
    const secondaryMuscles = item.muscle_group_secondary ? ` · ${item.muscle_group_secondary}` : '';
    const status = item.is_active === false ? ' · Inativo' : '';
    detail.textContent = `${primaryMuscle}${secondaryMuscles} · ${level?.name || item.level}${status}`;
    main.append(name, detail);
    row.appendChild(main);
    if (item.video_url && window.AcademiaTrainingMedia) {
      const media = document.createElement('div');
      media.className = 'video-preview-slot';
      window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
      const thumbnailVideo = media.querySelector('video');
      if (thumbnailVideo) thumbnailVideo.controls = false;
      row.appendChild(media);
    }
    if (canManageTrainingLevels()) {
      const actions = document.createElement('div');
      actions.className = 'entity-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'mini-button secondary';
      edit.textContent = 'Editar';
      edit.title = `Editar ${item.name}`;
      edit.addEventListener('click', (event) => {
        event.stopPropagation();
        openExerciseForm(item);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mini-button secondary danger';
      remove.textContent = item.is_active === false ? 'Ativar' : 'Excluir';
      remove.title = item.is_active === false ? `Ativar ${item.name}` : `Excluir ${item.name}`;
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        await toggleExercise(item, remove);
      });
      actions.append(edit, remove);
      row.appendChild(actions);
    }
    exerciseList.appendChild(row);
  }

  const planList = t('plan-list');
  planList.innerHTML = '';
  for (const item of plans) {
    const row = document.createElement('li');
    row.className = 'entity-card';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Visualizar ficha de ${item.member_name}`);
    row.addEventListener('click', () => openPlanDetails(item));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPlanDetails(item); } });
    const button = document.createElement('button');
    button.className = 'mini-button';
    button.textContent = 'Visualizar';
    button.addEventListener('click', (event) => { event.stopPropagation(); openPlanDetails(item); });
    const level = trainingLevels.find((candidate) => candidate.slug === item.level);
    row.append(`${item.member_name} - ${item.name} - ${level?.name || item.level} - ${item.age_days || 0} dias `, button);
    planList.appendChild(row);
  }
}

async function openPlanDetails(item) {
  try {
    const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(item.id)}`);
    t('plan-view-title').textContent = detail.plan?.name || item.name || 'Detalhes da ficha';
    t('plan-view-member').textContent = item.member_name || 'Aluno';
    t('plan-view-meta').textContent = `Início: ${String(detail.plan?.starts_at || item.starts_at || '').slice(0, 10) || '-'} · ${detail.plan?.status === 'active' ? 'Ativa' : (detail.plan?.status || 'Sem status')}`;
    t('plan-view-goal').textContent = `Objetivo: ${detail.plan?.goal || 'Não informado'}`;
    t('plan-view-level').textContent = `Nível: ${trainingLevels.find((level) => level.slug === (detail.plan?.level || item.level))?.name || detail.plan?.level || 'Não informado'}`;
    t('plan-view-age').textContent = `${detail.plan?.age_days || item.age_days || 0} dias`;
    const byDay = new Map((detail.days || []).map((day) => [day.id, { ...day, exercises: [] }]));
    for (const exercise of detail.exercises || []) {
      if (!byDay.has(exercise.workout_day_id)) byDay.set(exercise.workout_day_id, { id: exercise.workout_day_id, title: exercise.day_title, weekday: exercise.weekday, exercises: [] });
      byDay.get(exercise.workout_day_id).exercises.push(exercise);
    }
    const container = t('plan-view-days');
    container.replaceChildren();
    if (!byDay.size) {
      const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Nenhum dia ou exercício foi montado nesta ficha.'; container.appendChild(empty);
    }
    for (const day of [...byDay.values()].sort((a, b) => Number(a.weekday || 0) - Number(b.weekday || 0))) {
      const section = document.createElement('section'); section.className = 'plan-view-day';
      const title = document.createElement('h4'); title.textContent = `${day.weekday ? `Dia ${day.weekday} · ` : ''}${day.title || 'Treino'}`;
      section.appendChild(title);
      if (day.notes) { const notes = document.createElement('p'); notes.textContent = day.notes; section.appendChild(notes); }
      const list = document.createElement('ul'); list.className = 'plan-view-exercises';
      for (const exercise of day.exercises || []) {
        const row = document.createElement('li');
        const name = document.createElement('strong'); name.textContent = exercise.exercise_name || 'Exercício';
        const dosage = document.createElement('small'); dosage.textContent = `${exercise.sets || '-'} séries · ${exercise.reps || '-'} repetições`;
        const rest = document.createElement('small'); rest.textContent = `${exercise.rest_seconds || '-'}s descanso`;
        row.append(name, dosage, rest); list.appendChild(row);
      }
      if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Nenhum exercício neste dia.'; list.appendChild(empty); }
      section.appendChild(list); container.appendChild(section);
    }
    openTrainingModal('plan-view-modal');
  } catch (error) {
    setTrainingStatus(`Erro ao abrir ficha: ${error.message}`);
  }
}

function openExerciseDetails(item) {
  t('exercise-view-name').textContent = item.name || 'Exercício';
  const primaryMuscle = item.muscle_group_primary || item.muscle_group || 'Não informado';
  t('exercise-view-muscle').textContent = `Músculo principal: ${primaryMuscle}`;
  t('exercise-view-primary').textContent = primaryMuscle;
  t('exercise-view-secondary').textContent = item.muscle_group_secondary || 'Não informado';
  t('exercise-view-equipment').textContent = item.equipment || 'Peso livre ou equipamento não informado';
  t('exercise-view-level').textContent = trainingLevels.find((level) => level.slug === item.level)?.name || item.level || 'Não informado';
  t('exercise-view-instructions').textContent = item.instructions || 'Nenhuma orientação cadastrada para este exercício.';
  const media = t('exercise-view-media');
  media.replaceChildren();
  if (item.video_url && window.AcademiaTrainingMedia) {
    window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
  } else {
    const empty = document.createElement('span');
    empty.className = 'exercise-view-media-empty';
    empty.textContent = 'Nenhum vídeo cadastrado para este exercício.';
    media.appendChild(empty);
  }
  openTrainingModal('exercise-view-modal');
}

function openExerciseForm(item = null) {
  editingExerciseId = item?.id || null;
  editingOriginalVideoUrl = item?.video_url || '';
  t('exercise-title').textContent = item ? 'Editar exercício' : 'Novo exercício';
  t('create-exercise-button').textContent = item ? 'Salvar alterações' : 'Cadastrar exercício';
  t('exercise-name').value = item?.name || '';
  t('exercise-group').value = item?.muscle_group_primary || item?.muscle_group || '';
  t('exercise-secondary-muscles').value = item?.muscle_group_secondary || '';
  t('exercise-equipment').value = item?.equipment || '';
  t('exercise-level').value = item?.level || '';
  t('exercise-instructions').value = item?.instructions || '';
  t('exercise-active').checked = item ? item.is_active !== false : true;
  t('exercise-video-file').value = '';
  t('exercise-video-url').value = item?.video_url || '';
  t('exercise-video-source').value = item?.video_url && !item.video_url.startsWith('/uploads/') ? 'link' : 'upload';
  setVideoSourceMode();
  if (item?.video_url) previewVideoLink(item.video_url);
  openTrainingModal('exercise-modal');
}

async function toggleExercise(item, button) {
  const action = item.is_active === false ? 'ativar' : 'excluir';
  if (!window.confirm(`${action === 'excluir' ? 'Excluir' : 'Ativar'} o exercício "${item.name}"?`)) return;
  button.disabled = true;
  try {
    if (action === 'ativar') {
      await api('/api/training/exercises/update', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          muscle_group_primary: item.muscle_group_primary || item.muscle_group,
          muscle_group_secondary: item.muscle_group_secondary || '',
          equipment: item.equipment || '',
          level: item.level,
          instructions: item.instructions || '',
          video_url: item.video_url || '',
          is_active: true
        })
      });
      setTrainingStatus('Exercício ativado.');
    } else {
      await api('/api/training/exercises', { method: 'DELETE', body: JSON.stringify({ id: item.id }) });
      setTrainingStatus('Exercício excluído do catálogo.');
    }
    await loadBase();
  } catch (error) {
    setTrainingStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function createTrainingLevel(event) {
  event.preventDefault();
  const input = t('training-level-name');
  const button = event.submitter;
  button.disabled = true;
  try {
    await api('/api/training/levels', { method: 'POST', body: JSON.stringify({ name: input.value.trim() }) });
    input.value = '';
    setTrainingLevelStatus('Nivel adicionado.');
    await loadBase();
  } catch (error) {
    setTrainingLevelStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

const MAX_TRAINING_VIDEO_BYTES = 50 * 1024 * 1024;

function setVideoStatus(text) {
  t('exercise-video-status').textContent = text;
}

function clearVideoPreview() {
  const preview = t('exercise-video-preview');
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.removeAttribute('src');
  preview.hidden = true;
  preview.load();
  const image = t('exercise-media-preview');
  if (image?.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
}

function isAllowedTrainingMediaFile(file) {
  return file && ['image/gif', 'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(file.type);
}

function previewSelectedFile(file) {
  if (!file) {
    clearVideoPreview();
    setVideoStatus('Nenhuma demonstração selecionada.');
    return false;
  }
  if (!isAllowedTrainingMediaFile(file)) {
    clearVideoPreview();
    setVideoStatus('Formato inválido. Escolha GIF, MP4, WebM, OGG ou MOV.');
    return false;
  }
  if (file.size > MAX_TRAINING_VIDEO_BYTES) {
    clearVideoPreview();
    setVideoStatus('A demonstração ultrapassa o limite de 50 MB.');
    return false;
  }
  clearVideoPreview();
  const source = URL.createObjectURL(file);
  if (file.type === 'image/gif') {
    const image = t('exercise-media-preview');
    image.src = source;
    image.hidden = false;
  } else {
    const preview = t('exercise-video-preview');
    preview.src = source;
    preview.hidden = false;
    preview.play().catch(() => {});
  }
  setVideoStatus(`Demonstração selecionada: ${file.name}`);
  return true;
}

function previewVideoLink(value) {
  const url = value.trim();
  if (!url) {
    clearVideoPreview();
    setVideoStatus('Cole um link de GIF ou vídeo para visualizar.');
    return;
  }
  const isLocalUpload = url.startsWith('/uploads/');
  if (!isLocalUpload) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocolo');
    } catch (_) {
      clearVideoPreview();
      setVideoStatus('Use um link iniciado por http:// ou https://.');
      return;
    }
  }
  const previewUrl = isLocalUpload ? `${TRAINING_API_BASE_URL}${url}` : url;
  if (window.AcademiaTrainingMedia?.isDirectGifUrl(url)) {
    clearVideoPreview();
    const image = t('exercise-media-preview');
    image.src = previewUrl;
    image.hidden = false;
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'GIF direto detectado. A demonstração será repetida em loop.');
  } else if (window.AcademiaTrainingMedia?.isDirectVideoUrl(url)) {
    clearVideoPreview();
    const preview = t('exercise-video-preview');
    preview.src = previewUrl;
    preview.hidden = false;
    preview.play().catch(() => {});
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'Vídeo direto detectado. A demonstração será reproduzida em loop.');
  } else {
    clearVideoPreview();
    setVideoStatus(isLocalUpload ? 'Demonstração atual mantida. Escolha outro arquivo para substituir.' : 'Link salvo. Páginas de vídeo serão abertas em outra guia.');
  }
}

async function uploadTrainingVideo(file) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const result = await api('/api/training/videos', { method: 'POST', body: formData });
  return result.location;
}

function setVideoSourceMode() {
  const isUpload = t('exercise-video-source').value === 'upload';
  t('exercise-video-upload-field').classList.toggle('hidden', !isUpload);
  t('exercise-video-link-field').classList.toggle('hidden', isUpload);
  clearVideoPreview();
  setVideoStatus(isUpload ? 'Nenhuma demonstração selecionada.' : 'Cole um link de GIF ou vídeo para visualizar.');
}

async function createExercise() {
  const button = t('create-exercise-button');
  button.disabled = true;
  try {
    const source = t('exercise-video-source').value;
    let videoUrl = editingOriginalVideoUrl;
    if (source === 'upload') {
      const file = t('exercise-video-file').files[0];
      if (file && !previewSelectedFile(file)) return;
      if (file) {
        setTrainingStatus('Enviando demonstração...');
        videoUrl = await uploadTrainingVideo(file);
      }
    } else {
      videoUrl = t('exercise-video-url').value.trim();
      if (videoUrl) {
        const parsed = new URL(videoUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('link_video_invalido');
      }
    }
    const payload = {
      name: t('exercise-name').value.trim(),
      muscle_group: t('exercise-group').value.trim(),
      muscle_group_primary: t('exercise-group').value.trim(),
      muscle_group_secondary: t('exercise-secondary-muscles').value.trim(),
      equipment: t('exercise-equipment').value.trim(),
      level: t('exercise-level').value,
      instructions: t('exercise-instructions').value.trim(),
      video_url: videoUrl || null,
      is_active: t('exercise-active').checked
    };
    const path = editingExerciseId ? '/api/training/exercises/update' : '/api/training/exercises';
    await api(path, {
      method: 'POST',
      body: JSON.stringify(editingExerciseId ? { id: editingExerciseId, ...payload } : payload)
    });
    setTrainingStatus(editingExerciseId ? 'Exercício atualizado.' : 'Exercício criado.');
    editingExerciseId = null;
    editingOriginalVideoUrl = '';
    t('exercise-title').textContent = 'Novo exercício';
    t('create-exercise-button').textContent = 'Cadastrar exercício';
    t('exercise-video-file').value = '';
    t('exercise-video-url').value = '';
    setVideoSourceMode();
    await loadBase();
    closeTrainingModal('exercise-modal');
  } catch (error) {
    setTrainingStatus(`Erro: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function saveProfile() {
  await api('/api/training/profile', {
    method: 'POST',
    body: JSON.stringify({
      member_id: t('profile-member').value,
      level: t('profile-level').value,
      goal: t('profile-goal').value.trim(),
      training_days_per_week: Number(t('profile-days').value || 3),
      restrictions: t('profile-restrictions').value.trim()
    })
  });
  setTrainingStatus('Perfil de treino salvo.');
}

async function createPlan() {
  await api('/api/training/plans', {
    method: 'POST',
    body: JSON.stringify({
      member_id: t('plan-member').value,
      name: t('plan-name').value.trim(),
      level: t('plan-level').value,
      goal: t('plan-goal').value.trim(),
      starts_at: t('plan-start').value || null
    })
  });
  setTrainingStatus('Ficha criada.');
  await loadBase();
}

async function createDay() {
  await api('/api/training/plans/day', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: t('day-plan').value,
      weekday: Number(t('day-weekday').value || 1),
      title: t('day-title').value.trim(),
      notes: t('day-notes').value.trim()
    })
  });
  setTrainingStatus('Dia criado. Abra o detalhe da ficha para carregar o dia.');
}

async function loadPlanDetail(planId) {
  const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(planId)}`);
  days = [];
  const seen = new Set();
  for (const item of detail.exercises || []) {
    if (!seen.has(item.workout_day_id)) {
      seen.add(item.workout_day_id);
      days.push({ id: item.workout_day_id, title: item.day_title, weekday: item.weekday });
    }
  }
  fillSelect('exercise-day', days, (d) => `${d.weekday} - ${d.title}`, 'Selecione o dia da ficha');
  setTrainingStatus(`Ficha carregada: ${detail.plan.name}`);
}

async function addWorkoutExercise() {
  await api('/api/training/plans/exercise', {
    method: 'POST',
    body: JSON.stringify({
      workout_day_id: t('exercise-day').value,
      exercise_id: t('exercise-select').value,
      order_index: Number(t('workout-order').value || 1),
      sets: Number(t('workout-sets').value || 3),
      reps: t('workout-reps').value || '10-12',
      rest_seconds: Number(t('workout-rest').value || 60),
      load_hint: t('workout-load').value.trim()
    })
  });
  setTrainingStatus('Exercicio adicionado na ficha.');
}

async function reviewPlan() {
  const result = await api('/api/training/plans/review', {
    method: 'POST',
    body: JSON.stringify({ plan_id: t('review-plan').value })
  });
  const list = t('review-list');
  list.innerHTML = '';
  const title = document.createElement('li');
  title.textContent = result.recommendation;
  list.appendChild(title);
  for (const suggestion of result.suggestions || []) {
    const row = document.createElement('li');
    row.textContent = `${suggestion.type}: ${suggestion.reason || ''}`;
    list.appendChild(row);
  }
  setTrainingStatus('Analise gerada.');
}

t('create-exercise-button').addEventListener('click', createExercise);
t('training-level-form').addEventListener('submit', createTrainingLevel);
t('exercise-video-source').addEventListener('change', setVideoSourceMode);
t('exercise-video-file').addEventListener('change', (event) => previewSelectedFile(event.target.files[0]));
t('exercise-video-url').addEventListener('input', (event) => previewVideoLink(event.target.value));
t('save-profile-button').addEventListener('click', saveProfile);
t('create-plan-button').addEventListener('click', createPlan);
t('create-day-button').addEventListener('click', createDay);
t('add-workout-exercise-button').addEventListener('click', addWorkoutExercise);
t('review-plan-button').addEventListener('click', reviewPlan);

function syncTrainingModalState() {
  document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal:not(.hidden)')));
}

function openTrainingModal(id) {
  const modal = t(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncTrainingModalState();
}

function closeTrainingModal(id) {
  const modal = t(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  syncTrainingModalState();
}

[
  ['open-training-levels-button', 'training-levels-modal'],
  ['open-profile-button', 'profile-modal'],
  ['open-plan-button', 'plan-modal'],
  ['open-day-button', 'day-modal'],
  ['open-workout-exercise-button', 'workout-exercise-modal'],
  ['open-review-button', 'review-modal']
].forEach(([buttonId, modalId]) => t(buttonId)?.addEventListener('click', () => openTrainingModal(modalId)));
t('open-exercise-button')?.addEventListener('click', () => openExerciseForm());

[
  ['close-training-levels-modal', 'training-levels-modal'],
  ['close-exercise-modal', 'exercise-modal'],
  ['close-profile-modal', 'profile-modal'],
  ['close-plan-modal', 'plan-modal'],
  ['close-day-modal', 'day-modal'],
  ['close-workout-exercise-modal', 'workout-exercise-modal'],
  ['close-review-modal', 'review-modal'],
  ['close-exercise-view-modal', 'exercise-view-modal'],
  ['close-plan-view-modal', 'plan-view-modal']
].forEach(([buttonId, modalId]) => t(buttonId)?.addEventListener('click', () => closeTrainingModal(modalId)));

document.querySelectorAll('[data-close-training-modal]').forEach((button) => {
  button.addEventListener('click', () => closeTrainingModal(button.dataset.closeTrainingModal));
});
document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeTrainingModal(modal.id);
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = document.querySelector('.modal:not(.hidden)');
  if (open) closeTrainingModal(open.id);
});
loadBase().catch((error) => setTrainingStatus(`Erro: ${error.message}`));
