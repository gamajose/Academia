const alertsHost = window.location.hostname || 'localhost';
const ALERTS_API = localStorage.getItem('apiBaseUrl') || `http://${alertsHost}:3004`;
const ALERTS_TOKEN = localStorage.getItem('academiaToken') || '';
const g = (id) => document.getElementById(id);

async function api(path) {
  const response = await fetch(`${ALERTS_API}${path}`, {
    headers: { Authorization: `Bearer ${ALERTS_TOKEN}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function cents(value) {
  return `R$ ${(Number(value || 0) / 100).toFixed(2).replace('.', ',')}`;
}

function renderList(id, rows, formatter, emptyText) {
  const list = g(id);
  list.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('li');
    row.textContent = emptyText;
    list.appendChild(row);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('li');
    row.textContent = formatter(item);
    list.appendChild(row);
  }
}

async function loadAlerts() {
  if (!ALERTS_TOKEN) {
    if (g('alerts-total')) g('alerts-total').textContent = 'login';
    return;
  }
  const data = await api('/api/alerts');
  if (g('alerts-total')) g('alerts-total').textContent = data.summary.total;
  g('overdue-count').textContent = data.summary.overdue_payments;
  g('membership-count').textContent = data.summary.memberships_due_soon;
  g('training-count').textContent = data.summary.training_reviews_due;
  g('assessment-count').textContent = data.summary.assessments_due;

  renderList('overdue-list', data.overdue_payments || [], (item) => `${item.member_name} - ${cents(item.amount_cents)} - vencido ha ${item.days_overdue} dias`, 'Nenhum pagamento vencido.');
  renderList('membership-list', data.memberships_due_soon || [], (item) => `${item.member_name} - vence em ${item.days_remaining} dias`, 'Nenhuma matricula vencendo nos proximos 7 dias.');
  renderList('training-list', data.training_reviews_due || [], (item) => `${item.member_name} - ${item.plan_name} - ${item.age_days} dias de ficha`, 'Nenhuma ficha precisando de revisao.');
  renderList('assessment-alert-list', data.assessments_due || [], (item) => `${item.member_name} - ultima avaliacao: ${item.last_assessment_date || 'nunca'}`, 'Nenhuma avaliacao pendente.');
}

loadAlerts().catch((error) => {
  if (g('alerts-total')) g('alerts-total').textContent = 'erro';
  renderList('overdue-list', [], () => '', `Erro ao carregar alertas: ${error.message}`);
});
