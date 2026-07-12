const trainingHost = window.location.hostname || 'localhost';
const TRAINING_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${trainingHost}:3004`;
const trainingToken = localStorage.getItem('academiaToken') || '';
let members = [];
let exercises = [];
let plans = [];
let days = [];
let trainingLevels = [];

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
  return ['owner', 'admin'].includes(localStorage.getItem('academiaRole'));
}

function setTrainingLevelStatus(text) {
  t('training-level-status').textContent = text;
}

function renderTrainingLevels() {
  const panel = t('training-levels-panel');
  const list = t('training-level-list');
  if (!canManageTrainingLevels()) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
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
    form.append(input, activeLabel, save);
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
  setTrainingStatus('Treinos carregados.');
}

function renderAll() {
  fillLevelSelect('exercise-level');
  fillLevelSelect('profile-level');
  fillLevelSelect('plan-level');
  fillSelect('profile-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('plan-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('exercise-select', exercises, (e) => `${e.name} - ${e.muscle_group}`, 'Selecione o exercicio');
  fillSelect('day-plan', plans, (p) => `${p.member_name} - ${p.name}`, 'Selecione a ficha');
  fillSelect('review-plan', plans, (p) => `${p.member_name} - ${p.name} (${p.age_days || 0} dias)`, 'Selecione a ficha');
  renderTrainingLevels();

  const exerciseList = t('exercise-list');
  exerciseList.innerHTML = '';
  for (const item of exercises) {
    const row = document.createElement('li');
    row.className = 'entity-card';
    const main = document.createElement('div');
    main.className = 'entity-main';
    const name = document.createElement('strong');
    name.textContent = item.name;
    const detail = document.createElement('span');
    detail.textContent = `${item.muscle_group} · ${item.level}`;
    main.append(name, detail);
    row.appendChild(main);
    if (item.video_url && window.AcademiaTrainingMedia) {
      const media = document.createElement('div');
      media.className = 'video-preview-slot';
      window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
      row.appendChild(media);
    }
    exerciseList.appendChild(row);
  }

  const planList = t('plan-list');
  planList.innerHTML = '';
  for (const item of plans) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'mini-button';
    button.textContent = 'Detalhar';
    button.addEventListener('click', () => loadPlanDetail(item.id));
    row.append(`${item.member_name} - ${item.name} - ${item.level} - ${item.age_days || 0} dias `, button);
    planList.appendChild(row);
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
}

function isAllowedVideoFile(file) {
  return file && ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'].includes(file.type);
}

function previewSelectedFile(file) {
  if (!file) {
    clearVideoPreview();
    setVideoStatus('Nenhum video selecionado.');
    return false;
  }
  if (!isAllowedVideoFile(file)) {
    clearVideoPreview();
    setVideoStatus('Formato invalido. Escolha MP4, WebM, OGG ou MOV.');
    return false;
  }
  if (file.size > MAX_TRAINING_VIDEO_BYTES) {
    clearVideoPreview();
    setVideoStatus('O video ultrapassa o limite de 50 MB.');
    return false;
  }
  const preview = t('exercise-video-preview');
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  preview.play().catch(() => {});
  setVideoStatus(`Video selecionado: ${file.name}`);
  return true;
}

function previewVideoLink(value) {
  const url = value.trim();
  if (!url) {
    clearVideoPreview();
    setVideoStatus('Cole um link de video para visualizar.');
    return;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocolo');
  } catch (_) {
    clearVideoPreview();
    setVideoStatus('Use um link iniciado por http:// ou https://.');
    return;
  }
  if (window.AcademiaTrainingMedia?.isDirectVideoUrl(url)) {
    const preview = t('exercise-video-preview');
    if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
    preview.src = url;
    preview.hidden = false;
    preview.play().catch(() => {});
    setVideoStatus('Link direto detectado. O video sera reproduzido em loop.');
  } else {
    clearVideoPreview();
    setVideoStatus('Link salvo. Paginas de video serao abertas em outra guia.');
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
  setVideoStatus(isUpload ? 'Nenhum video selecionado.' : 'Cole um link de video para visualizar.');
}

async function createExercise() {
  const button = t('create-exercise-button');
  button.disabled = true;
  try {
    const source = t('exercise-video-source').value;
    let videoUrl = '';
    if (source === 'upload') {
      const file = t('exercise-video-file').files[0];
      if (file && !previewSelectedFile(file)) return;
      if (file) {
        setTrainingStatus('Enviando video...');
        videoUrl = await uploadTrainingVideo(file);
      }
    } else {
      videoUrl = t('exercise-video-url').value.trim();
      if (videoUrl) {
        const parsed = new URL(videoUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('link_video_invalido');
      }
    }
    await api('/api/training/exercises', {
      method: 'POST',
      body: JSON.stringify({
        name: t('exercise-name').value.trim(),
        muscle_group: t('exercise-group').value.trim(),
        equipment: t('exercise-equipment').value.trim(),
        level: t('exercise-level').value,
        instructions: t('exercise-instructions').value.trim(),
        video_url: videoUrl || null
      })
    });
    setTrainingStatus('Exercicio criado.');
    t('exercise-video-file').value = '';
    t('exercise-video-url').value = '';
    setVideoSourceMode();
    await loadBase();
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
loadBase().catch((error) => setTrainingStatus(`Erro: ${error.message}`));
