const studentsHost = window.location.hostname || 'localhost';
const STUDENTS_API = localStorage.getItem('apiBaseUrl') || `http://${studentsHost}:3004`;
const STUDENTS_TOKEN = localStorage.getItem('academiaToken') || '';
const s = (id) => document.getElementById(id);
let students = [];
let memberships = [];
let payments = [];

async function api(path, options = {}) {
  const response = await fetch(`${STUDENTS_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENTS_TOKEN}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentMembership(memberId) {
  return memberships.find((item) => item.member_id === memberId || item.member_id == memberId);
}

function debt(memberId) {
  return payments.filter((item) => item.member_id === memberId && item.status === 'pending').reduce((total, item) => total + Number(item.amount_cents || 0), 0);
}

function rowButton(text, handler) {
  const button = document.createElement('button');
  button.className = 'mini-button';
  button.textContent = text;
  button.addEventListener('click', handler);
  return button;
}

function renderStudents() {
  const list = s('students-list');
  const term = s('student-search').value.toLowerCase();
  list.innerHTML = '';
  const rows = students.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(term));
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Nenhum aluno encontrado.';
    list.appendChild(empty);
    return;
  }
  for (const student of rows) {
    const item = document.createElement('li');
    const membership = currentMembership(student.id);
    const pending = debt(student.id);
    item.append(`${student.name} | ${student.status} | plano: ${membership ? membership.plan_name : 'sem plano'} | financeiro: ${pending > 0 ? `inadimplente ${money(pending)}` : 'em dia'} `);
    item.appendChild(rowButton('Editar', () => openForm(student)));
    item.appendChild(rowButton(student.status === 'active' ? 'Desativar' : 'Ativar', () => toggleStudent(student)));
    list.appendChild(item);
  }
}

async function loadStudents() {
  if (!STUDENTS_TOKEN) {
    s('students-status').textContent = 'Faça login no painel antes de acessar alunos.';
    return;
  }
  try {
    const [membersResult, membershipsResult, paymentsResult] = await Promise.all([
      api('/api/members'),
      api('/api/memberships'),
      api('/api/payments')
    ]);
    students = membersResult.data || [];
    memberships = membershipsResult.data || [];
    payments = paymentsResult.data || [];
    renderStudents();
    s('students-status').textContent = 'Alunos carregados.';
  } catch (error) {
    s('students-status').textContent = `Erro: ${error.message}`;
  }
}

function openForm(student = null) {
  s('student-form-panel').classList.remove('hidden');
  s('student-id').value = student?.id || '';
  s('student-name').value = student?.name || '';
  s('student-email').value = student?.email || '';
  s('student-phone').value = student?.phone || '';
}

async function saveStudent() {
  try {
    const id = s('student-id').value;
    const payload = { name: s('student-name').value.trim(), email: s('student-email').value.trim(), phone: s('student-phone').value.trim() };
    if (id) await api('/api/members/update', { method: 'POST', body: JSON.stringify({ member_id: id, ...payload }) });
    else await api('/api/members', { method: 'POST', body: JSON.stringify(payload) });
    s('student-form-panel').classList.add('hidden');
    await loadStudents();
  } catch (error) {
    s('students-status').textContent = `Erro ao salvar: ${error.message}`;
  }
}

async function toggleStudent(student) {
  const path = student.status === 'active' ? '/api/members/deactivate' : '/api/members/activate';
  await api(path, { method: 'POST', body: JSON.stringify({ member_id: student.id }) });
  await loadStudents();
}

s('new-student-button').addEventListener('click', () => openForm());
s('save-student-button').addEventListener('click', saveStudent);
s('student-search').addEventListener('input', renderStudents);
loadStudents();
