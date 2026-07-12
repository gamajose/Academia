const STUDENT_PORTAL_API = localStorage.getItem('studentApiBaseUrl') || localStorage.getItem('apiBaseUrl') || `http://${window.location.hostname || 'localhost'}:3004`;
const STUDENT_PORTAL_TOKEN = localStorage.getItem('studentToken') || '';
let currentPlan = null;
let currentDayId = '';
let currentExercises = [];
let portalBusy = false;

const p = (id) => document.getElementById(id);

function setPortalStatus(text) {
  if (p('student-portal-status')) p('student-portal-status').textContent = text;
}

async function portalApi(path, options = {}) {
  const response = await fetch(`${STUDENT_PORTAL_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${STUDENT_PORTAL_TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function todayWeekday() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function makeEntity(title, subtitle, detail = '') {
  const row = document.createElement('li');
  row.className = 'entity-card';
  const main = document.createElement('div');
  main.className = 'entity-main';
  main.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>${detail ? `<span>${detail}</span>` : ''}`;
  row.appendChild(main);
  return row;
}

function renderExercises() {
  const list = p('portal-exercise-list');
  list.innerHTML = '';
  for (const item of currentExercises) {
    const title = item.exercise_name || 'Exercício';
    const subtitle = `${item.sets || '-'} séries · ${item.reps || '-'} repetições · ${item.rest_seconds || '-'}s de descanso`;
    const detail = [item.day_title, item.instructions].filter(Boolean).join(' · ');
    const row = makeEntity(title, subtitle, detail);
    if (item.video_url && window.AcademiaTrainingMedia) {
      const media = document.createElement('div');
      media.className = 'video-preview-slot';
      window.AcademiaTrainingMedia.appendVideoPreview(media, item.video_url);
      row.appendChild(media);
    }
    list.appendChild(row);
  }
  if (!currentExercises.length) {
    const row = document.createElement('li');
    row.className = 'empty-state';
    row.textContent = 'Nenhum exercício cadastrado para hoje.';
    list.appendChild(row);
  }
}

function renderProgress(progress) {
  const assessmentList = p('portal-progress-list');
  const goalList = p('portal-goal-list');
  assessmentList.innerHTML = '';
  goalList.innerHTML = '';

  for (const item of progress.assessments || []) {
    assessmentList.appendChild(makeEntity(
      item.assessment_date || 'Avaliação',
      `Peso: ${item.weight_kg || '-'} kg · Gordura: ${item.body_fat_percent || '-'}%`,
      `Cintura: ${item.waist_cm || '-'} cm`
    ));
  }
  if (!(progress.assessments || []).length) {
    const item = document.createElement('li');
    item.className = 'empty-state';
    item.textContent = 'Nenhuma avaliação registrada ainda.';
    assessmentList.appendChild(item);
  }

  for (const item of progress.goals || []) {
    goalList.appendChild(makeEntity(
      item.goal_type || 'Meta',
      `Alvo: ${item.target_value || '-'} · Prazo: ${item.target_date || '-'}`,
      item.status || 'Em andamento'
    ));
  }
  if (!(progress.goals || []).length) {
    const item = document.createElement('li');
    item.className = 'empty-state';
    item.textContent = 'Nenhuma meta cadastrada ainda.';
    goalList.appendChild(item);
  }
}

async function loadStudentPortal(silent = false) {
  if (!STUDENT_PORTAL_TOKEN) {
    window.location.href = './student-login.html';
    return;
  }
  if (portalBusy) return;
  portalBusy = true;

  try {
    const me = await portalApi('/api/student/me');
    const studentName = me.name || localStorage.getItem('studentName') || 'Aluno';
    localStorage.setItem('studentName', studentName);
    p('student-portal-title').textContent = `Meu treino, ${studentName.split(' ')[0]}`;
    p('student-profile-name').textContent = studentName;
    p('student-profile-avatar').textContent = studentName.charAt(0).toUpperCase();

    const detail = await portalApi('/api/student/training/current');
    currentPlan = detail.plan;
    const weekday = todayWeekday();
    const allExercises = detail.exercises || [];
    currentExercises = allExercises.filter((item) => Number(item.weekday) === weekday);
    if (!currentExercises.length) currentExercises = allExercises;
    currentDayId = currentExercises[0]?.workout_day_id || '';

    p('student-portal-meta').textContent = currentPlan
      ? `Ficha: ${currentPlan.name} · Nível: ${currentPlan.level || '-'} · Objetivo: ${currentPlan.goal || '-'} · ${currentPlan.age_days || 0} dias`
      : 'Nenhuma ficha ativa no momento.';
    renderExercises();
    await loadPortalLogs();
    const progress = await portalApi('/api/student/progress');
    renderProgress(progress);
    if (!silent) setPortalStatus('Treino carregado.');
    p('student-auto-sync').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  } catch (error) {
    setPortalStatus(`Erro: ${error.message}`);
  } finally {
    portalBusy = false;
  }
}

async function loadPortalLogs() {
  const result = await portalApi('/api/student/training/logs');
  const list = p('portal-log-list');
  list.innerHTML = '';
  for (const item of result.data || []) {
    list.appendChild(makeEntity(
      item.day_title || item.plan_name || 'Treino concluído',
      new Date(item.completed_at).toLocaleString('pt-BR'),
      `Esforço percebido: ${item.perceived_effort || '-'}`
    ));
  }
  if (!(result.data || []).length) {
    const item = document.createElement('li');
    item.className = 'empty-state';
    item.textContent = 'Nenhum treino concluído ainda.';
    list.appendChild(item);
  }
}

async function completePortalWorkout() {
  if (!currentPlan || !currentDayId) {
    setPortalStatus('Treino ainda não carregado.');
    return;
  }
  try {
    p('portal-complete-button').disabled = true;
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
    setPortalStatus('Treino marcado como concluído. Ótimo trabalho!');
  } catch (error) {
    setPortalStatus(`Erro: ${error.message}`);
  } finally {
    p('portal-complete-button').disabled = false;
  }
}

function logoutPortal() {
  localStorage.removeItem('studentToken');
  localStorage.removeItem('studentName');
  document.cookie = 'academiaStudentAuth=; Path=/; Max-Age=0; SameSite=Lax';
  window.location.href = './student-login.html';
}

const profileTrigger = p('student-profile-trigger');
const profileDropdown = p('student-profile-dropdown');
profileTrigger.addEventListener('click', (event) => {
  event.stopPropagation();
  profileDropdown.classList.toggle('hidden');
  profileTrigger.setAttribute('aria-expanded', String(!profileDropdown.classList.contains('hidden')));
});
document.addEventListener('click', () => profileDropdown.classList.add('hidden'));
p('student-profile-logout').addEventListener('click', logoutPortal);
p('portal-complete-button').addEventListener('click', completePortalWorkout);
window.setInterval(() => loadStudentPortal(true), 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadStudentPortal(true); });
loadStudentPortal();
