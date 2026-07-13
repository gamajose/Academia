const FH = window.location.hostname || 'localhost';
const FAPI = localStorage.getItem('apiBaseUrl') || `http://${FH}:3004`;
const FT = localStorage.getItem('academiaToken') || '';
const f = (id) => document.getElementById(id);
let rows = [];

async function rq(path, options = {}) {
  const response = await fetch(`${FAPI}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FT}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function brl(value) {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateOnly(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(value);
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('pt-BR');
}

function dateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(payment) {
  if (payment.status === 'paid') return 'Recebido';
  const due = payment.due_date ? new Date(`${payment.due_date}T23:59:59`) : null;
  if (payment.status === 'pending' && due && due < new Date()) return 'Vencido';
  if (payment.status === 'pending') return 'Pendente';
  if (payment.status === 'cancelled') return 'Cancelado';
  return payment.status || '-';
}

function statusClass(label) {
  return label === 'Recebido' ? 'ok' : label === 'Vencido' ? 'bad' : label === 'Pendente' ? 'warn' : '';
}

function methodLabel(value) {
  const labels = { demo: 'Demonstração', pix: 'Pix', paypal: 'PayPal', card: 'Cartão', cash: 'Dinheiro', transfer: 'Transferência', manual: 'Manual', other: 'Outro' };
  return labels[String(value || '').toLowerCase()] || value || 'Não informado';
}

function actionButton(text, handler, disabled = false) {
  const button = document.createElement('button');
  button.className = 'mini-button';
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', handler);
  return button;
}

function draw() {
  const list = f('financial-list');
  list.innerHTML = '';

  const totals = rows.reduce((acc, item) => {
    const amount = Number(item.amount_cents || 0);
    const label = statusLabel(item);
    if (item.status === 'paid') {
      acc.paid += amount;
      acc.paidCount += 1;
    } else if (item.status === 'pending') {
      acc.pending += amount;
      acc.pendingCount += 1;
      if (label === 'Vencido') acc.overdue += amount;
    }
    return acc;
  }, { paid: 0, pending: 0, overdue: 0, paidCount: 0, pendingCount: 0 });

  f('pending-amount').textContent = brl(totals.pending);
  f('overdue-amount').textContent = brl(totals.overdue);
  f('paid-amount').textContent = brl(totals.paid);
  f('pending-count').textContent = totals.pendingCount;
  f('paid-count').textContent = totals.paidCount;

  for (const item of rows) {
    const tr = document.createElement('tr');
    const label = statusLabel(item);
    tr.innerHTML = `
      <td>${item.member_name || '-'}</td>
      <td>${brl(item.amount_cents)}</td>
      <td><span class="badge ${statusClass(label)}">${label}</span></td>
      <td class="finance-date-cell">${item.paid_at ? `<strong>Recebido em</strong><span>${dateTime(item.paid_at)}</span>` : `<strong>Vencimento</strong><span>${dateOnly(item.due_date)}</span>`}</td>
      <td>${methodLabel(item.method)}</td>
      <td></td>
    `;
    const actions = tr.querySelector('td:last-child');
    actions.appendChild(actionButton('Ajustar', () => openM(item)));
    actions.appendChild(actionButton(item.status === 'paid' ? 'Recebido' : 'Marcar como recebido', () => pay(item), item.status === 'paid'));
    list.appendChild(tr);
  }

  if (!rows.length) {
    list.innerHTML = '<tr><td colspan="6">Nenhum lançamento financeiro encontrado.</td></tr>';
  }
}

async function load() {
  try {
    const result = await rq('/api/reports/finance-advanced');
    rows = result.data || [];
    draw();
    f('reports-status').textContent = 'Financeiro carregado.';
  } catch (error) {
    f('reports-status').textContent = `Erro: ${error.message}`;
  }
}

function openM(item) {
  f('finance-modal').classList.remove('hidden');
  f('finance-payment-id').value = item.id;
  f('finance-title').textContent = `Ajuste financeiro - ${item.member_name}`;
  f('finance-discount').value = (Number(item.discount_cents || 0) / 100).toFixed(2);
  f('finance-fee').value = (Number(item.fee_cents || 0) / 100).toFixed(2);
  f('finance-method').value = item.method || 'manual';
  f('finance-notes').value = item.notes || '';
}

function closeM() {
  f('finance-modal').classList.add('hidden');
}

async function adjust() {
  await rq('/api/reports/finance-adjust', {
    method: 'POST',
    body: JSON.stringify({
      payment_id: f('finance-payment-id').value,
      discount_cents: Math.round(Number(f('finance-discount').value || 0) * 100),
      fee_cents: Math.round(Number(f('finance-fee').value || 0) * 100),
      method: f('finance-method').value.trim() || 'manual',
      notes: f('finance-notes').value.trim()
    })
  });
  closeM();
  await load();
}

async function pay(item) {
  await rq('/api/payments/mark-paid', { method: 'POST', body: JSON.stringify({ payment_id: item.id }) });
  await load();
}

f('load-button')?.addEventListener('click', load);
f('close-finance-modal')?.addEventListener('click', closeM);
f('finance-adjust-button')?.addEventListener('click', adjust);
load();
