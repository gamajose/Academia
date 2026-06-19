const assessmentHost = window.location.hostname || 'localhost';
const ASSESSMENT_API = localStorage.getItem('apiBaseUrl') || `http://${assessmentHost}:3004`;
const ASSESSMENT_TOKEN = localStorage.getItem('academiaToken') || '';
const q = (id) => document.getElementById(id);

function setAssessmentStatus(text) {
  q('assessment-status').textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(`${ASSESSMENT_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ASSESSMENT_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function fillSelect(id, members) {
  const select = q(id);
  select.innerHTML = '<option value="">Selecione o aluno</option>';
  for (const member of members) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    select.appendChild(option);
  }
}

function value(id) {
  return q(id).value;
}

async function loadBase() {
  if (!ASSESSMENT_TOKEN) {
    setAssessmentStatus('Entre no painel principal antes de acessar avaliacoes.');
    return;
  }
  const membersResult = await api('/api/members');
  const members = (membersResult.data || []).filter((m) => m.status === 'active');
  fillSelect('assessment-member', members);
  fillSelect('goal-member', members);
  fillSelect('summary-member', members);
  await loadAssessments();
  await loadGoals();
  setAssessmentStatus('Avaliacoes carregadas.');
}

async function createAssessment() {
  try {
    await api('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('assessment-member'),
        assessment_date: value('assessment-date') || null,
        weight_kg: value('weight-kg'),
        height_cm: value('height-cm'),
        body_fat_percent: value('body-fat'),
        muscle_mass_kg: value('muscle-mass'),
        waist_cm: value('waist-cm'),
        chest_cm: value('chest-cm'),
        hip_cm: value('hip-cm'),
        photo_url: value('photo-url'),
        notes: value('assessment-notes')
      })
    });
    setAssessmentStatus('Avaliacao salva.');
    await loadAssessments();
  } catch (error) {
    setAssessmentStatus(`Erro: ${error.message}`);
  }
}

async function createGoal() {
  try {
    await api('/api/goals', {
      method: 'POST',
      body: JSON.stringify({
        member_id: value('goal-member'),
        goal_type: value('goal-type'),
        target_value: value('goal-value'),
        target_date: value('goal-date') || null,
        notes: value('goal-notes')
      })
    });
    setAssessmentStatus('Meta salva.');
    await loadGoals();
  } catch (error) {
    setAssessmentStatus(`Erro: ${error.message}`);
  }
}

async function loadAssessments() {
  const result = await api('/api/assessments');
  const list = q('assessment-list');
  list.innerHTML = '';
  for (const item of result.data || []) {
    const row = document.createElement('li');
    row.textContent = `${item.assessment_date} - ${item.member_name} | Peso: ${item.weight_kg || '-'}kg | Gordura: ${item.body_fat_percent || '-'}% | Cintura: ${item.waist_cm || '-'}cm`;
    list.appendChild(row);
  }
}

async function loadGoals() {
  const result = await api('/api/goals');
  const list = q('goal-list');
  list.innerHTML = '';
  for (const item of result.data || []) {
    const row = document.createElement('li');
    row.textContent = `${item.member_name} - ${item.goal_type} | Alvo: ${item.target_value || '-'} | Data: ${item.target_date || '-'} | ${item.status}`;
    list.appendChild(row);
  }
}

async function loadSummary() {
  try {
    const memberId = value('summary-member');
    if (!memberId) {
      setAssessmentStatus('Selecione um aluno para o resumo.');
      return;
    }
    const result = await api(`/api/assessments/summary?member_id=${encodeURIComponent(memberId)}`);
    const list = q('summary-list');
    list.innerHTML = '';
    if (!result.current) {
      list.innerHTML = '<li>Nenhuma avaliacao encontrada.</li>';
      return;
    }
    const items = [
      `Atual: ${result.current.assessment_date}`,
      `Peso atual: ${result.current.weight_kg || '-'}kg`,
      `Gordura atual: ${result.current.body_fat_percent || '-'}%`,
      `Massa muscular: ${result.current.muscle_mass_kg || '-'}kg`,
      `Variacao de peso: ${result.delta?.weight_kg ?? '-'}kg`,
      `Variacao de gordura: ${result.delta?.body_fat_percent ?? '-'}%`,
      `Variacao de cintura: ${result.delta?.waist_cm ?? '-'}cm`
    ];
    for (const item of items) {
      const row = document.createElement('li');
      row.textContent = item;
      list.appendChild(row);
    }
    setAssessmentStatus('Resumo carregado.');
  } catch (error) {
    setAssessmentStatus(`Erro: ${error.message}`);
  }
}

q('create-assessment-button').addEventListener('click', createAssessment);
q('create-goal-button').addEventListener('click', createGoal);
q('load-summary-button').addEventListener('click', loadSummary);
loadBase().catch((error) => setAssessmentStatus(`Erro: ${error.message}`));
