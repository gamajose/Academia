const STUDENT_PORTAL_API = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
const STUDENT_PORTAL_TOKEN = localStorage.getItem('studentToken') || '';
let currentPlan = null;
let currentDayId = '';
let currentExercises = [];

const p = (id) => document.getElementById(id);

function setPortalStatus(text) {
  p('student-portal-status').textContent = text;
  p('student-portal-status-card').textContent = text;
}

async function portalApi(path, options = {}) {
  const response = await fetch(`${STUDENT_PORTAL_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENT_PORTAL_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function todayWeekday() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function renderExercises() {
  const list = p('portal-exercise-list');
  list.innerHTML = '';
  for (const item of currentExercises) {
    const row = document.createElement('li');
    const video = item.video_url ? ` | Video: ${item.video_url}` : '';
    row.textContent = `${item.day_title} - ${item.exercise_name} | ${item.sets} series | ${item.reps} reps | descanso ${item.rest_seconds}s | ${item.instructions || ''}${video}`;
    list.appendChild(row);
  }
  if (!currentExercises.length) {
    const row = document.createElement('li');
    row.textContent = 'Nenhum exercicio cadastrado para hoje.';
    list.appendChild(row);
  }
}

function renderProgress(progress) {
  const assessmentList = p('portal-progress-list');
  const goalList = p('portal-goal-list');
  assessmentList.innerHTML = '';
  goalList.innerHTML = '';

  for (const item of progress.assessments || []) {
    const row = document.createElement('li');
    row.textContent = `${item.assessment_date} | Peso: ${item.weight_kg || '-'}kg | Gordura: ${item.body_fat_percent || '-'}% | Cintura: ${item.waist_cm || '-'}cm`;
    assessmentList.appendChild(row);
  }
  if (!(progress.assessments || []).length) {
    assessmentList.innerHTML = '<li>Nenhuma avaliacao registrada ainda.</li>';
  }

  for (const item of progress.goals || []) {
    const row = document.createElement('li');
    row.textContent = `${item.goal_type} | Alvo: ${item.target_value || '-'} | Data: ${item.target_date || '-'} | ${item.status}`;
    goalList.appendChild(row);
  }
  if (!(progress.goals || []).length) {
    goalList.innerHTML = '<li>Nenhuma meta cadastrada ainda.</li>';
  }
}

async function loadStudentPortal() {
  if (!STUDENT_PORTAL_TOKEN) {
    window.location.href = './student-login.html';
    return;
  }

  try {
    const me = await portalApi('/api/student/me');
    p('student-portal-title').textContent = `Meu treino - ${me.name}`;

    const detail = await portalApi('/api/student/training/current');
    currentPlan = detail.plan;
    const weekday = todayWeekday();
    const allExercises = detail.exercises || [];
    currentExercises = allExercises.filter((item) => Number(item.weekday) === weekday);
    if (!currentExercises.length) currentExercises = allExercises;
    currentDayId = currentExercises[0]?.workout_day_id || '';

    p('student-portal-meta').textContent = `Ficha: ${currentPlan.name} | Nivel: ${currentPlan.level} | Objetivo: ${currentPlan.goal || '-'} | ${currentPlan.age_days || 0} dias`;
    renderExercises();
    await loadPortalLogs();
    const progress = await portalApi('/api/student/progress');
    renderProgress(progress);
    setPortalStatus('Treino carregado.');
  } catch (error) {
    setPortalStatus(`Erro: ${error.message}`);
  }
}

async function loadPortalLogs() {
  const result = await portalApi('/api/student/training/logs');
  const list = p('portal-log-list');
  list.innerHTML = '';
  for (const item of result.data || []) {
    const row = document.createElement('li');
    row.textContent = `${item.completed_at} - ${item.plan_name} - ${item.day_title} - esforco ${item.perceived_effort || '-'}`;
    list.appendChild(row);
  }
}

async function completePortalWorkout() {
  if (!currentPlan || !currentDayId) {
    setPortalStatus('Treino ainda nao carregado.');
    return;
  }
  try {
    await portalApi('/api/student/training/complete', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: currentPlan.id,
        workout_day_id: currentDayId,
        perceived_effort: Number(p('portal-effort').value || 0) || null,
        feedback: p('portal-feedback').value.trim()
      })
    });
    p('portal-effort').value = '';
    p('portal-feedback').value = '';
    await loadPortalLogs();
    setPortalStatus('Treino marcado como feito.');
  } catch (error) {
    setPortalStatus(`Erro: ${error.message}`);
  }
}

function logoutPortal() {
  localStorage.removeItem('studentToken');
  localStorage.removeItem('studentName');
  document.cookie = 'academiaStudentAuth=; Path=/; Max-Age=0; SameSite=Lax';
  window.location.href = './student-login.html';
}

p('student-refresh-button').addEventListener('click', loadStudentPortal);
p('portal-complete-button').addEventListener('click', completePortalWorkout);
p('student-logout-button').addEventListener('click', logoutPortal);
loadStudentPortal();
