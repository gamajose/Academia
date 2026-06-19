const studentHost = window.location.hostname || 'localhost';
const STUDENT_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${studentHost}:3004`;
const studentToken = localStorage.getItem('academiaToken') || '';
let currentMemberId = '';
let currentPlan = null;
let currentDayId = '';
let currentExercises = [];

const s = (id) => document.getElementById(id);

function setStudentStatus(text) {
  s('student-status').textContent = text;
  s('student-status-card').textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(`${STUDENT_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
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

function fillMembers(members) {
  const select = s('student-member');
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Selecione o aluno';
  select.appendChild(empty);
  for (const member of members) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    select.appendChild(option);
  }
}

async function loadMembers() {
  if (!studentToken) {
    setStudentStatus('Entre no painel principal antes de abrir a area do aluno.');
    return;
  }
  const result = await api('/api/members');
  fillMembers((result.data || []).filter((m) => m.status === 'active'));
  setStudentStatus('Aluno carregado.');
}

async function loadStudentWorkout() {
  currentMemberId = s('student-member').value;
  if (!currentMemberId) {
    setStudentStatus('Selecione um aluno.');
    return;
  }

  const plansResult = await api(`/api/training/plans?member_id=${encodeURIComponent(currentMemberId)}`);
  const plan = (plansResult.data || []).find((p) => p.status === 'active') || (plansResult.data || [])[0];
  if (!plan) {
    setStudentStatus('Aluno sem ficha cadastrada.');
    return;
  }

  const detail = await api(`/api/training/plans/detail?plan_id=${encodeURIComponent(plan.id)}`);
  currentPlan = detail.plan;
  const weekday = todayWeekday();
  const allExercises = detail.exercises || [];
  currentExercises = allExercises.filter((item) => Number(item.weekday) === weekday);
  if (!currentExercises.length) currentExercises = allExercises;
  currentDayId = currentExercises[0]?.workout_day_id || '';

  s('student-plan-title').textContent = `${plan.member_name} - ${currentPlan.name}`;
  s('student-plan-meta').textContent = `Nivel: ${currentPlan.level} | Objetivo: ${currentPlan.goal || '-'} | Idade da ficha: ${currentPlan.age_days || 0} dias`;
  renderExercises();
  await loadLogs();
  setStudentStatus('Treino pronto.');
}

function renderExercises() {
  const list = s('student-exercise-list');
  list.innerHTML = '';
  for (const item of currentExercises) {
    const row = document.createElement('li');
    const video = item.video_url ? ` | Video: ${item.video_url}` : '';
    row.textContent = `${item.day_title} - ${item.exercise_name} | ${item.sets} series | ${item.reps} reps | descanso ${item.rest_seconds}s | ${item.instructions || ''}${video}`;
    list.appendChild(row);
  }
  if (!currentExercises.length) {
    const row = document.createElement('li');
    row.textContent = 'Nenhum exercicio cadastrado para esta ficha.';
    list.appendChild(row);
  }
}

async function loadLogs() {
  if (!currentMemberId) return;
  const result = await api(`/api/training/execution/logs?member_id=${encodeURIComponent(currentMemberId)}`);
  const list = s('student-log-list');
  list.innerHTML = '';
  for (const item of result.data || []) {
    const row = document.createElement('li');
    row.textContent = `${item.completed_at} - ${item.plan_name} - ${item.day_title} - esforco ${item.perceived_effort || '-'}`;
    list.appendChild(row);
  }
}

async function completeWorkout() {
  if (!currentPlan || !currentDayId || !currentMemberId) {
    setStudentStatus('Carregue uma ficha antes de concluir.');
    return;
  }
  await api('/api/training/execution/day', {
    method: 'POST',
    body: JSON.stringify({
      member_id: currentMemberId,
      plan_id: currentPlan.id,
      workout_day_id: currentDayId,
      perceived_effort: Number(s('student-effort').value || 0) || null,
      feedback: s('student-feedback').value.trim(),
      status: 'completed'
    })
  });
  s('student-effort').value = '';
  s('student-feedback').value = '';
  await loadLogs();
  setStudentStatus('Treino marcado como feito.');
}

s('load-student-workout-button').addEventListener('click', loadStudentWorkout);
s('complete-workout-button').addEventListener('click', completeWorkout);
loadMembers().catch((error) => setStudentStatus(`Erro: ${error.message}`));
