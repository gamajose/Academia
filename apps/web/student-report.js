const reportHost = window.location.hostname || 'localhost';
const REPORT_API = localStorage.getItem('apiBaseUrl') || `http://${reportHost}:3004`;
const REPORT_TOKEN = localStorage.getItem('academiaToken') || '';
const r = (id) => document.getElementById(id);
let members = [];

async function api(path) {
  const response = await fetch(`${REPORT_API}${path}`, { headers: { Authorization: `Bearer ${REPORT_TOKEN}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function renderList(id, rows, formatter, empty) {
  const element = r(id);
  element.textContent = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = empty;
    element.appendChild(li);
    return;
  }
  for (const row of rows) {
    const li = document.createElement('li');
    li.textContent = formatter(row);
    element.appendChild(li);
  }
}

async function loadMembers() {
  const result = await api('/api/members');
  members = result.data || [];
  r('report-member').textContent = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Selecione o aluno';
  r('report-member').appendChild(empty);
  for (const member of members) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = member.name;
    r('report-member').appendChild(option);
  }
}

async function loadReport() {
  const memberId = r('report-member').value;
  const member = members.find((item) => item.id === memberId);
  if (!memberId || !member) return;
  const assessments = await api(`/api/assessments?member_id=${encodeURIComponent(memberId)}`);
  const goals = await api(`/api/goals?member_id=${encodeURIComponent(memberId)}`);
  const summary = await api(`/api/assessments/summary?member_id=${encodeURIComponent(memberId)}`);
  r('report-title').textContent = `Relatorio de ${member.name}`;
  r('report-summary').textContent = summary.current ? `Ultima avaliacao: ${summary.current.assessment_date} | Peso: ${summary.current.weight_kg || '-'}kg | Gordura: ${summary.current.body_fat_percent || '-'}% | Cintura: ${summary.current.waist_cm || '-'}cm` : 'Aluno sem avaliacao registrada.';
  renderList('report-assessments', assessments.data || [], (item) => `${item.assessment_date} | Peso ${item.weight_kg || '-'}kg | Gordura ${item.body_fat_percent || '-'}% | Cintura ${item.waist_cm || '-'}cm`, 'Nenhuma avaliacao.');
  renderList('report-goals', goals.data || [], (item) => `${item.goal_type} | Alvo ${item.target_value || '-'} | Data ${item.target_date || '-'} | ${item.status}`, 'Nenhuma meta.');
  renderList('report-logs', [], () => '', 'Historico detalhado de treinos disponivel no portal do aluno.');
}

async function openNativePdf() {
  const memberId = r('report-member').value;
  if (!memberId) return;
  const response = await fetch(`${REPORT_API}/api/reports/student-pdf?member_id=${encodeURIComponent(memberId)}`, { headers: { Authorization: `Bearer ${REPORT_TOKEN}` } });
  if (!response.ok) throw new Error('erro_pdf');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

r('load-report-button').addEventListener('click', loadReport);
r('download-pdf-button').addEventListener('click', () => openNativePdf().catch((error) => { r('report-summary').textContent = `Erro PDF: ${error.message}`; }));
r('print-report-button').addEventListener('click', () => window.print());
loadMembers().catch((error) => { r('report-summary').textContent = `Erro: ${error.message}`; });
