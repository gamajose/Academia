const reportsHost = window.location.hostname || 'localhost';
const REPORTS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${reportsHost}:3004`;
const reportsToken = localStorage.getItem('academiaToken') || '';

const byId = (id) => document.getElementById(id);

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function request(path) {
  const response = await fetch(`${REPORTS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${reportsToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

async function loadReports() {
  if (!reportsToken) {
    byId('reports-status').textContent = 'Faca login no painel principal antes de abrir os relatorios.';
    return;
  }

  try {
    const overview = await request('/api/reports/overview');
    const financial = await request('/api/reports/financial');
    const memberships = await request('/api/reports/memberships');

    byId('total-members').textContent = overview.total_members || 0;
    byId('active-members-report').textContent = overview.active_members || 0;
    byId('active-memberships-report').textContent = overview.active_memberships || 0;
    byId('pending-amount').textContent = money(overview.pending_amount_cents);
    byId('paid-amount').textContent = money(overview.paid_amount_cents);

    const financialList = byId('financial-list');
    financialList.innerHTML = '';
    for (const item of financial.data || []) {
      const row = document.createElement('li');
      row.textContent = `${item.member_name} - ${money(item.amount_cents)} - ${item.status} - ${item.due_date}`;
      financialList.appendChild(row);
    }

    const membershipsList = byId('memberships-report-list');
    membershipsList.innerHTML = '';
    for (const item of memberships.data || []) {
      const row = document.createElement('li');
      row.textContent = `${item.member_name} - ${item.plan_name} - ${item.status} - ${item.starts_at} ate ${item.ends_at}`;
      membershipsList.appendChild(row);
    }

    byId('reports-status').textContent = 'Relatorios carregados.';
  } catch (error) {
    byId('reports-status').textContent = `Erro ao carregar relatorios: ${error.message}`;
  }
}

byId('load-button').addEventListener('click', loadReports);
loadReports();
