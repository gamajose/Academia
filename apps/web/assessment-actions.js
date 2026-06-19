const actionHost = window.location.hostname || 'localhost';
const ACTION_API = localStorage.getItem('apiBaseUrl') || `http://${actionHost}:3004`;
const ACTION_TOKEN = localStorage.getItem('academiaToken') || '';
const a = (id) => document.getElementById(id);

function status(text) {
  a('actions-status').textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(`${ACTION_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACTION_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function renderList(id, rows, formatter, empty) {
  const list = a(id);
  list.textContent = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = empty;
    list.appendChild(li);
    return;
  }
  for (const item of rows) {
    const li = document.createElement('li');
    li.textContent = formatter(item);
    list.appendChild(li);
  }
}

async function loadActions() {
  const assessments = await api('/api/assessments');
  const goals = await api('/api/goals');
  renderList('assessment-action-list', assessments.data || [], (item) => `${item.member_name} | ${item.assessment_date} | ID: ${item.id} | Peso ${item.weight_kg || '-'}kg`, 'Nenhuma avaliação.');
  renderList('goal-action-list', goals.data || [], (item) => `${item.member_name} | ${item.goal_type} | ${item.status} | ID: ${item.id}`, 'Nenhuma meta.');
  status('Listas carregadas.');
}

async function updateAssessment() {
  try {
    await api('/api/training/assessments/update', {
      method: 'POST',
      body: JSON.stringify({
        assessment_id: a('assessment-id').value.trim(),
        weight_kg: a('assessment-weight').value.trim(),
        body_fat_percent: a('assessment-fat').value.trim(),
        waist_cm: a('assessment-waist').value.trim(),
        notes: a('assessment-notes').value.trim()
      })
    });
    status('Avaliação atualizada.');
    await loadActions();
  } catch (error) {
    status(`Erro: ${error.message}`);
  }
}

async function updateGoal() {
  try {
    await api('/api/training/goals/status', {
      method: 'POST',
      body: JSON.stringify({ goal_id: a('goal-id').value.trim(), status: a('goal-status').value })
    });
    status('Meta atualizada.');
    await loadActions();
  } catch (error) {
    status(`Erro: ${error.message}`);
  }
}

a('update-assessment-button').addEventListener('click', updateAssessment);
a('update-goal-button').addEventListener('click', updateGoal);
a('reload-actions-button').addEventListener('click', () => loadActions().catch((error) => status(`Erro: ${error.message}`)));
loadActions().catch((error) => status(`Erro: ${error.message}`));
