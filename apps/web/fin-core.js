const FH = window.location.hostname || 'localhost';
const FAPI = localStorage.getItem('apiBaseUrl') || `http://${FH}:3004`;
const FT = localStorage.getItem('academiaToken') || '';
const f = (id) => document.getElementById(id);
let rows = [];
let currentPage = 1;
let pageSize = 10;

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
  if (payment.status === 'overdue') return 'Vencido';
  const due = payment.due_date ? new Date(`${payment.due_date}T23:59:59`) : null;
  if (payment.status === 'pending' && due && due < new Date()) return 'Vencido';
  if (payment.status === 'pending') return 'Pendente';
  if (payment.status === 'cancelled') return 'Cancelado';
  return payment.status || '-';
}

function statusClass(label) {
  return label === 'Recebido' ? 'ok' : label === 'Vencido' ? 'bad' : label === 'Pendente' ? 'warn' : '';
}

function financeStatusKey(item) {
  if (item.status === 'paid') return 'paid';
  return statusLabel(item) === 'Vencido' ? 'overdue' : item.status || 'other';
}

function methodLabel(value) {
  const labels = { demo: 'Demonstração', pix: 'Pix', paypal: 'PayPal', card: 'Cartão', cash: 'Dinheiro', transfer: 'Transferência', manual: 'Manual', other: 'Outro' };
  return labels[String(value || '').toLowerCase()] || value || 'Não informado';
}

function filterRows() {
  const member = (f('finance-filter-member')?.value || '').trim().toLowerCase();
  const status = f('finance-filter-status')?.value || '';
  const method = f('finance-filter-method')?.value || '';
  const minValue = f('finance-filter-min')?.value || '';
  const maxValue = f('finance-filter-max')?.value || '';
  const min = minValue === '' ? Number.NaN : Number(minValue);
  const max = maxValue === '' ? Number.NaN : Number(maxValue);
  const from = f('finance-filter-from')?.value || '';
  const to = f('finance-filter-to')?.value || '';
  return rows.filter((item) => {
    const searchable = `${item.member_name || ''} ${item.member_email || ''} ${item.phone || ''}`.toLowerCase();
    const amount = Number(item.amount_cents || 0) / 100;
    const itemStatus = item.status === 'paid' ? 'paid' : statusLabel(item) === 'Vencido' ? 'overdue' : item.status;
    const dueDate = String(item.due_date || '').slice(0, 10);
    return (!member || searchable.includes(member))
      && (!status || itemStatus === status)
      && (!method || String(item.method || '').toLowerCase() === method)
      && (!Number.isFinite(min) || amount >= min)
      && (!Number.isFinite(max) || amount <= max)
      && (!from || dueDate >= from)
      && (!to || dueDate <= to);
  });
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
  const visibleRows = filterRows();
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totals = visibleRows.reduce((acc, item) => {
    const amount = Number(item.amount_cents || 0);
    const label = statusLabel(item);
    if (item.status === 'paid') {
      acc.paid += amount;
      acc.paidCount += 1;
    } else if (item.status === 'pending' || item.status === 'overdue') {
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

  for (const item of pageRows) {
    const tr = document.createElement('tr');
    tr.className = 'finance-row-action';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.title = 'Abrir ajuste financeiro';
    const label = statusLabel(item);
    tr.innerHTML = `
      <td class="finance-member-name">${item.member_name || '-'}</td>
      <td class="col-amount">${brl(item.amount_cents)}</td>
      <td><span class="badge ${statusClass(label)}">${label}</span></td>
      <td class="finance-date-cell col-due">${item.paid_at ? `<strong>Recebido em</strong><span>${dateTime(item.paid_at)}</span>` : `<strong>Vencimento</strong><span>${dateOnly(item.due_date)}</span>`}</td>
      <td>${methodLabel(item.method)}</td>
      <td class="finance-actions-cell"></td>
    `;
    const actions = tr.querySelector('td:last-child');
    tr.addEventListener('click', () => openM(item));
    tr.addEventListener('keydown', (event) => { if (event.target.closest('button, .finance-card-menu-dropdown')) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openM(item); } });

    const actionWrap = document.createElement('div');
    actionWrap.className = 'finance-card-actions';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'icon-button finance-card-menu-trigger';
    trigger.setAttribute('aria-label', `Ações financeiras de ${item.member_name || 'aluno'}`);
    trigger.textContent = '⋮';

    const menu = document.createElement('div');
    menu.className = 'finance-card-menu-dropdown hidden';

    const adjustBtn = document.createElement('button');
    adjustBtn.type = 'button';
    adjustBtn.textContent = 'Ajustar';
    adjustBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.add('hidden');
      tr.classList.remove('menu-open');
      openM(item);
    });
    menu.appendChild(adjustBtn);

    if (item.status !== 'paid') {
      const pixBtn = document.createElement('button');
      pixBtn.type = 'button';
      pixBtn.textContent = 'Cobrar Pix';
      pixBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.add('hidden');
        tr.classList.remove('menu-open');
        openPixModal(item);
      });
      menu.appendChild(pixBtn);

      const markPaidBtn = document.createElement('button');
      markPaidBtn.type = 'button';
      markPaidBtn.textContent = 'Marcar como recebido';
      markPaidBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.add('hidden');
        tr.classList.remove('menu-open');
        pay(item);
      });
      menu.appendChild(markPaidBtn);
    }

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.textContent = 'Ver detalhes';
    detailsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.classList.add('hidden');
      tr.classList.remove('menu-open');
      openM(item);
    });
    menu.appendChild(detailsBtn);

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.finance-card-menu-dropdown').forEach((d) => d.classList.add('hidden'));
      document.querySelectorAll('#financial-list tr').forEach((el) => {
        el.classList.remove('menu-open');
        el.style.zIndex = '';
      });
      if (willOpen) {
        menu.classList.remove('hidden');
        tr.classList.add('menu-open');
        tr.style.zIndex = '1200';
      }
    });

    actionWrap.append(trigger, menu);
    actions.appendChild(actionWrap);
    list.appendChild(tr);
  }

  if (!rows.length) {
    list.innerHTML = '<tr><td colspan="6">Nenhum lançamento financeiro encontrado.</td></tr>';
  } else if (!visibleRows.length) {
    list.innerHTML = '<tr><td colspan="6">Nenhum lançamento corresponde aos filtros.</td></tr>';
  }
  renderPagination(visibleRows.length, pageCount);
}

function renderPagination(total, pageCount) {
  const container = f('finance-pagination');
  if (!container) return;
  container.innerHTML = '';
  if (!total) return;
  const size = document.createElement('label');
  size.className = 'entity-page-size';
  size.append('Por página');
  const select = document.createElement('select');
  for (const optionValue of [10, 15, 20, 50, 100]) {
    const option = document.createElement('option');
    option.value = String(optionValue);
    option.textContent = String(optionValue);
    option.selected = optionValue === pageSize;
    select.appendChild(option);
  }
  select.addEventListener('change', () => { pageSize = Number(select.value) || 10; currentPage = 1; draw(); });
  size.appendChild(select);
  const info = document.createElement('span');
  info.textContent = `Página ${currentPage} de ${pageCount}`;
  const summary = document.createElement('div');
  summary.className = 'entity-page-summary';
  summary.append(size, info);
  const controls = document.createElement('div');
  controls.className = 'entity-page-buttons';
  if (pageCount > 1) {
    for (const [label, page, disabled] of [['‹', currentPage - 1, currentPage === 1], ['›', currentPage + 1, currentPage === pageCount]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'icon-button'; button.textContent = label; button.disabled = disabled;
      button.setAttribute('aria-label', page < currentPage ? 'Página anterior' : 'Próxima página');
      button.onclick = () => { currentPage = page; draw(); };
      controls.appendChild(button);
    }
  }
  container.append(summary, controls);
}

async function load() {
  try {
    const result = await rq('/api/reports/finance-advanced');
    rows = result.data || [];
    currentPage = 1;
    draw();
    f('reports-status').textContent = '';
    rq('/api/gym/payment-settings').then((res) => {
      if (res?.payment_settings?.pix?.key || res?.pix_key) {
        localStorage.setItem('gymPixKey', res.payment_settings?.pix?.key || res.pix_key);
      }
      if (res?.payment_settings?.pix?.receiver_name) {
        localStorage.setItem('gymPixReceiver', res.payment_settings.pix.receiver_name);
      }
    }).catch(() => {});
  } catch (error) {
    f('reports-status').textContent = `Erro: ${error.message}`;
  }
}

function openM(item) {
  f('finance-modal').classList.remove('hidden');
  f('finance-payment-id').value = item.id;
  f('finance-title').textContent = item.member_name || 'Lançamento';
  f('finance-discount').value = (Number(item.discount_cents || 0) / 100).toFixed(2);
  f('finance-fee').value = (Number(item.fee_cents || 0) / 100).toFixed(2);
  f('finance-status').value = ['pending', 'paid', 'overdue', 'cancelled'].includes(item.status) ? item.status : 'pending';
  f('finance-method').value = item.method || 'manual';
  f('finance-notes').value = item.notes || '';
}

function closeM() {
  f('finance-modal').classList.add('hidden');
}

function openFinanceStatus(kind) {
  const labels = { pending: 'Lançamentos pendentes', overdue: 'Lançamentos vencidos', paid: 'Pagamentos recebidos', open: 'Lançamentos em aberto' };
  const matching = rows.filter((item) => {
    const key = financeStatusKey(item);
    return kind === 'open' ? key === 'pending' || key === 'overdue' : key === kind;
  });
  f('finance-status-title').textContent = labels[kind] || 'Lançamentos';
  const list = f('finance-status-list');
  list.innerHTML = '';
  if (!matching.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Nenhum lançamento nesta categoria.';
    list.appendChild(empty);
  } else {
    for (const item of matching) {
      const entry = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.member_name || 'Aluno';
      const detail = document.createElement('span');
      const date = item.paid_at ? `Recebido em ${dateTime(item.paid_at)}` : `Vencimento: ${dateOnly(item.due_date)}`;
      detail.textContent = `${brl(item.amount_cents)} · ${statusLabel(item)} · ${date} · ${methodLabel(item.method)}`;
      entry.append(title, detail);
      list.appendChild(entry);
    }
  }
  f('finance-status-modal').classList.remove('hidden');
}

function closeFinanceStatus() {
  f('finance-status-modal').classList.add('hidden');
}

async function adjust() {
  await rq('/api/reports/finance-adjust', {
    method: 'POST',
    body: JSON.stringify({
      payment_id: f('finance-payment-id').value,
      discount_cents: Math.round(Number(f('finance-discount').value || 0) * 100),
      fee_cents: Math.round(Number(f('finance-fee').value || 0) * 100),
      status: f('finance-status').value,
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

function exportQuery() {
  const params = new URLSearchParams();
  const fields = [
    ['member', 'finance-filter-member'], ['status', 'finance-filter-status'], ['method', 'finance-filter-method'],
    ['due_from', 'finance-filter-from'], ['due_to', 'finance-filter-to']
  ];
  for (const [key, id] of fields) {
    const current = f(id)?.value || '';
    if (current) params.set(key, current);
  }
  const minValue = f('finance-filter-min')?.value || '';
  const maxValue = f('finance-filter-max')?.value || '';
  if (minValue !== '' && Number.isFinite(Number(minValue))) params.set('min_amount_cents', String(Math.round(Number(minValue) * 100)));
  if (maxValue !== '' && Number.isFinite(Number(maxValue))) params.set('max_amount_cents', String(Math.round(Number(maxValue) * 100)));
  return params.toString();
}

async function downloadExport(format) {
  const response = await fetch(`${FAPI}/api/exports/payments.${format}?${exportQuery()}`, { headers: { Authorization: `Bearer ${FT}` } });
  if (!response.ok) throw new Error('não foi possível gerar o arquivo');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `financeiro-filtrado.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

f('load-button')?.addEventListener('click', load);
f('finance-apply-filters')?.addEventListener('click', draw);
['finance-filter-member', 'finance-filter-status', 'finance-filter-method', 'finance-filter-min', 'finance-filter-max', 'finance-filter-from', 'finance-filter-to'].forEach((id) => f(id)?.addEventListener('change', draw));
f('finance-filter-member')?.addEventListener('input', draw);
function toggleFinanceFilters() {
  const panel = f('finance-filter-panel');
  const hidden = panel.classList.toggle('hidden');
  f('finance-filter-toggle').setAttribute('aria-expanded', String(!hidden));
  if (!hidden) setTimeout(() => f('finance-filter-member')?.focus(), 40);
}
f('finance-filter-toggle')?.addEventListener('click', toggleFinanceFilters);
f('finance-download-csv')?.addEventListener('click', () => downloadExport('csv').catch((error) => { f('reports-status').textContent = `Erro ao exportar CSV: ${error.message}`; }));
f('finance-download-pdf')?.addEventListener('click', () => downloadExport('pdf').catch((error) => { f('reports-status').textContent = `Erro ao exportar PDF: ${error.message}`; }));
f('close-finance-modal')?.addEventListener('click', closeM);
f('finance-modal')?.addEventListener('click', (e) => { if (e.target === f('finance-modal')) closeM(); });
f('close-finance-status-modal')?.addEventListener('click', closeFinanceStatus);
f('finance-status-modal')?.addEventListener('click', (e) => { if (e.target === f('finance-status-modal')) closeFinanceStatus(); });
f('finance-adjust-button')?.addEventListener('click', adjust);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeM();
    closeFinanceStatus();
    closePixModal();
  }
});

for (const [selector, kind] of [['.finance-pending', 'pending'], ['.finance-overdue', 'overdue'], ['.finance-paid', 'paid'], ['.finance-open', 'open'], ['.finance-paid-count', 'paid']]) {
  document.querySelector(selector)?.addEventListener('click', () => openFinanceStatus(kind));
  document.querySelector(selector)?.setAttribute('tabindex', '0');
  document.querySelector(selector)?.setAttribute('role', 'button');
  document.querySelector(selector)?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFinanceStatus(kind); } });
}
let currentPixItem = null;

function closePixModal() {
  const modal = f('pix-charge-modal');
  if (modal) modal.classList.add('hidden');
  currentPixItem = null;
}

function openPixModal(item) {
  currentPixItem = item;
  const modal = f('pix-charge-modal');
  if (!modal) return;

  const gymName = localStorage.getItem('gymPixReceiver') || localStorage.getItem('gymName') || 'BlueREC Academia';
  const pixKey = localStorage.getItem('gymPixKey') || 'financeiro@academia.com.br';
  const amountBrl = Number(item.amount_cents || 0) / 100;
  const formattedAmount = brl(item.amount_cents);
  const formattedDueDate = dateOnly(item.due_date);
  const label = statusLabel(item);

  if (f('pix-member-name')) f('pix-member-name').textContent = item.member_name || 'Aluno';
  if (f('pix-member-due')) f('pix-member-due').textContent = `Vencimento: ${formattedDueDate}`;
  if (f('pix-member-amount')) f('pix-member-amount').textContent = formattedAmount;
  const badge = f('pix-member-badge');
  if (badge) {
    badge.className = `badge ${statusClass(label)}`;
    badge.textContent = label;
  }

  // Generate Pix string
  let pixPayload = '';
  if (window.AcademiaPix?.generatePixPayload) {
    pixPayload = window.AcademiaPix.generatePixPayload({
      pixKey,
      merchantName: gymName,
      merchantCity: 'BRASIL',
      amount: amountBrl,
      txid: (item.id || 'MENSALIDADE').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25)
    });
  } else {
    pixPayload = pixKey;
  }

  const copiaColaInput = f('pix-copia-cola');
  if (copiaColaInput) copiaColaInput.value = pixPayload;

  // Render QR Code
  const canvas = f('pix-qr-canvas');
  if (canvas && window.QRCode?.toCanvas) {
    window.QRCode.toCanvas(canvas, pixPayload, {
      width: 200,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
  }

  // WhatsApp Pre-formatted Message
  const phone = (item.phone || '').replace(/\D/g, '');
  const waPhone = phone ? (phone.startsWith('55') ? phone : `55${phone}`) : '';
  const waMsg = `Olá, *${item.member_name || 'Aluno'}*! Tudo bem?\n\nSegue a chave Pix para pagamento da sua mensalidade na *${gymName}*:\n\n💰 *Valor:* ${formattedAmount}\n📅 *Vencimento:* ${formattedDueDate}\n\n📋 *Pix Copia e Cola:*\n\`\`\`${pixPayload}\`\`\`\n\nQualquer dúvida, estamos à disposição!`;

  const waLink = f('pix-whatsapp-link');
  if (waLink) {
    waLink.href = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`;
  }

  modal.classList.remove('hidden');
}

// Copy Pix code button
f('pix-copy-btn')?.addEventListener('click', () => {
  const code = f('pix-copia-cola')?.value || '';
  if (code && navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = f('pix-copy-btn');
      const orig = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  }
});

// Mark as paid button from modal
f('pix-mark-paid-btn')?.addEventListener('click', () => {
  if (currentPixItem) {
    pay(currentPixItem);
    closePixModal();
  }
});

f('close-pix-modal')?.addEventListener('click', closePixModal);
f('pix-charge-modal')?.addEventListener('click', (e) => {
  if (e.target === f('pix-charge-modal')) closePixModal();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.finance-card-actions')) {
    document.querySelectorAll('.finance-card-menu-dropdown').forEach((d) => d.classList.add('hidden'));
    document.querySelectorAll('#financial-list tr').forEach((el) => {
      el.classList.remove('menu-open');
      el.style.zIndex = '';
    });
  }
});

load();
