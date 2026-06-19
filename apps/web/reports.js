const reportsHost = window.location.hostname || 'localhost';
const REPORTS_API_BASE_URL = localStorage.getItem('apiBaseUrl') || `http://${reportsHost}:3004`;
const reportsToken = localStorage.getItem('academiaToken') || '';

const byId = (id) => document.getElementById(id);

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function request(path, options = {}) {
  const response = await fetch(`${REPORTS_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${reportsToken}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function renderEmpty(list, text) {
  const row = document.createElement('li');
  row.textContent = text;
  list.appendChild(row);
}

async function loadReports() {
  if (!reportsToken) {
    byId('reports-status').textContent = 'Faca login no painel principal antes de abrir os relatorios.';
    return;
  }

  try {
    const overview = await request('/api/reports/overview');
    const financial = await request('/api/reports/finance-advanced');
    const memberships = await request('/api/reports/memberships');

    byId('total-members').textContent = overview.total_members || 0;
    byId('active-members-report').textContent = overview.active_members || 0;
    byId('active-memberships-report').textContent = overview.active_memberships || 0;
    byId('pending-amount').textContent = money(overview.pending_amount_cents);
    byId('paid-amount').textContent = money(overview.paid_amount_cents);

    const financialList = byId('financial-list');
    financialList.innerHTML = '';
    if (!(financial.data || []).length) renderEmpty(financialList, 'Nenhum lancamento financeiro.');
    for (const item of financial.data || []) {
      const row = document.createElement('li');
      row.textContent = `${item.member_name} - ${money(item.amount_cents)} - ${item.status} - ${item.due_date} - ID: ${item.id} - desc ${money(item.discount_cents)} - taxa ${money(item.fee_cents)}`;
      financialList.appendChild(row);
    }

    const membershipsList = byId('memberships-report-list');
    membershipsList.innerHTML = '';
    if (!(memberships.data || []).length) renderEmpty(membershipsList, 'Nenhuma matricula.');
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

async function adjustFinance() {
  try {
    await request('/api/reports/finance-adjust', {
      method: 'POST',
      body: JSON.stringify({
        payment_id: byId('finance-payment-id').value.trim(),
        discount_cents: Number(byId('finance-discount').value || 0),
        fee_cents: Number(byId('finance-fee').value || 0),
        method: byId('finance-method').value.trim(),
        notes: byId('finance-notes').value.trim()
      })
    });
    byId('reports-status').textContent = 'Ajuste financeiro aplicado.';
    await loadReports();
  } catch (error) {
    byId('reports-status').textContent = `Erro no ajuste: ${error.message}`;
  }
}

byId('load-button').addEventListener('click', loadReports);
byId('finance-adjust-button').addEventListener('click', adjustFinance);
loadReports();
