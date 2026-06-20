const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const TOKEN = localStorage.getItem('academiaToken') || '';
const $ = (id) => document.getElementById(id);
let rows = [];

async function req(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function brl(v) { return (Number(v || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function btn(text, fn) { const b = document.createElement('button'); b.className = 'mini-button'; b.textContent = text; b.onclick = fn; return b; }
function val(id) { return $(id)?.value?.trim() || ''; }

function render() {
  const list = $('students-list');
  const term = val('student-search').toLowerCase();
  list.innerHTML = '';
  for (const item of rows.filter((x) => `${x.name} ${x.email || ''} ${x.phone || ''}`.toLowerCase().includes(term))) {
    const li = document.createElement('li');
    const pending = Number(item.pending_amount_cents || 0);
    li.append(`${item.name} | ${item.status} | ${item.plan_name || 'sem plano'} | ${pending > 0 ? 'pendente ' + brl(pending) : 'em dia'} `);
    li.appendChild(btn('Cadastro', () => openModal(item)));
    li.appendChild(btn(item.status === 'active' ? 'Desativar' : 'Ativar', () => toggle(item)));
    list.appendChild(li);
  }
  if (!list.children.length) { const li = document.createElement('li'); li.textContent = 'Nenhum aluno encontrado.'; list.appendChild(li); }
}

async function load() {
  if (!TOKEN) { location.href = './admin.html'; return; }
  try {
    const result = await req('/api/members/detail');
    rows = result.data || [];
    render();
    $('students-status').textContent = 'Alunos carregados.';
  } catch (error) { $('students-status').textContent = `Erro: ${error.message}`; }
}

function openModal(item = {}) {
  $('student-form-panel').classList.remove('hidden');
  $('student-id').value = item.id || '';
  $('student-name').value = item.name || '';
  $('student-document').value = item.document || '';
  $('student-email').value = item.email || '';
  $('student-phone').value = item.phone || '';
  $('student-birth').value = item.birth_date ? String(item.birth_date).slice(0, 10) : '';
  $('student-emergency').value = item.emergency_contact || '';
  $('student-address').value = item.address || '';
  $('student-objective').value = item.objective || '';
  $('student-allergies').value = item.allergies || '';
  $('student-medical').value = item.medical_notes || '';
  $('student-nutrition').value = item.nutrition_notes || '';
  $('student-notes').value = item.notes || '';
}

function closeModal() { $('student-form-panel').classList.add('hidden'); }

async function save() {
  try {
    await req('/api/members/detail/save', {
      method: 'POST',
      body: JSON.stringify({
        member_id: val('student-id') || undefined,
        name: val('student-name'),
        document: val('student-document'),
        email: val('student-email'),
        phone: val('student-phone'),
        birth_date: val('student-birth') || null,
        emergency_contact: val('student-emergency'),
        address: val('student-address'),
        objective: val('student-objective'),
        allergies: val('student-allergies'),
        medical_notes: val('student-medical'),
        nutrition_notes: val('student-nutrition'),
        notes: val('student-notes')
      })
    });
    closeModal();
    await load();
  } catch (error) { $('students-status').textContent = `Erro ao salvar: ${error.message}`; }
}

async function toggle(item) {
  await req(item.status === 'active' ? '/api/members/deactivate' : '/api/members/activate', { method: 'POST', body: JSON.stringify({ member_id: item.id }) });
  await load();
}

$('new-student-button').onclick = () => openModal();
$('close-student-modal').onclick = closeModal;
$('save-student-button').onclick = save;
$('student-search').oninput = render;
load();
