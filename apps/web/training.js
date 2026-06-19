const trainingHost = window.location.hostname || 'localhost';
const TRAINING_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${trainingHost}:3004`;
const trainingToken = localStorage.getItem('academiaToken') || '';
let members = [];
let exercises = [];
let plans = [];
let days = [];

const t = (id) => document.getElementById(id);

function setTrainingStatus(text) {
  t('training-status').textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(`${TRAINING_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${trainingToken}`,
      ...(options.headers || {})
    }
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

async function loadBase() {
  if (!trainingToken) {
    setTrainingStatus('Entre no painel principal antes de acessar treinos.');
    return;
  }
  const memberResult = await api('/api/members');
  const exerciseResult = await api('/api/training/exercises');
  const planResult = await api('/api/training/plans');
  members = memberResult.data || [];
  exercises = exerciseResult.data || [];
  plans = planResult.data || [];
  renderAll();
  setTrainingStatus('Treinos carregados.');
}

function renderAll() {
  fillSelect('profile-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('plan-member', members, (m) => m.name, 'Selecione o aluno');
  fillSelect('exercise-select', exercises, (e) => `${e.name} - ${e.muscle_group}`, 'Selecione o exercicio');
  fillSelect('day-plan', plans, (p) => `${p.member_name} - ${p.name}`, 'Selecione a ficha');
  fillSelect('review-plan', plans, (p) => `${p.member_name} - ${p.name} (${p.age_days || 0} dias)`, 'Selecione a ficha');

  const exerciseList = t('exercise-list');
  exerciseList.innerHTML = '';
  for (const item of exercises) {
    const row = document.createElement('li');
    const video = item.video_url ? ` - video: ${item.video_url}` : '';
    row.textContent = `${item.name} - ${item.muscle_group} - ${item.level}${video}`;
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

async function createExercise() {
  await api('/api/training/exercises', {
    method: 'POST',
    body: JSON.stringify({
      name: t('exercise-name').value.trim(),
      muscle_group: t('exercise-group').value.trim(),
      equipment: t('exercise-equipment').value.trim(),
      level: t('exercise-level').value,
      instructions: t('exercise-instructions').value.trim(),
      video_url: t('exercise-video').value.trim()
    })
  });
  setTrainingStatus('Exercicio criado.');
  await loadBase();
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
t('save-profile-button').addEventListener('click', saveProfile);
t('create-plan-button').addEventListener('click', createPlan);
t('create-day-button').addEventListener('click', createDay);
t('add-workout-exercise-button').addEventListener('click', addWorkoutExercise);
t('review-plan-button').addEventListener('click', reviewPlan);
loadBase().catch((error) => setTrainingStatus(`Erro: ${error.message}`));
