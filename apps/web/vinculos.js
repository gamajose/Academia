const VH = window.location.hostname || 'localhost';
const VAPI = localStorage.getItem('apiBaseUrl') || `http://${VH}:3004`;
const VTOKEN = localStorage.getItem('academiaToken') || '';
const v = (id) => document.getElementById(id);
let links = [];
let members = [];
let plans = [];
let editingLinkId = '';
let currentPage = 1;
let pageSize = 10;

async function call(path, options = {}) {
  const response = await fetch(`${VAPI}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

function opt(select, rows, label) {
  select.innerHTML = '<option value="">Selecione</option>';
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = label(row);
    select.appendChild(option);
  }
}

function mini(text, fn, disabled = false) {
  const b = document.createElement('button');
  b.className = 'mini-button';
  b.textContent = text;
  b.disabled = disabled;
  b.onclick = fn;
  return b;
}

function dateOnly(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10).split('-').map(Number);
  return raw.length === 3 && raw.every(Number.isFinite) ? new Date(raw[0], raw[1] - 1, raw[2]).toLocaleDateString('pt-BR') : String(value);
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function memberNameTone(item) {
  const declared = String(item.gender || item.sex || '').toLowerCase();
  if (['f', 'female', 'feminino', 'mulher'].includes(declared)) return 'female';
  if (['m', 'male', 'masculino', 'homem'].includes(declared)) return 'male';
  const firstName = String(item.member_name || '').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const femaleNames = new Set(['ana', 'amanda', 'aline', 'beatriz', 'camila', 'carolina', 'fernanda', 'gabriela', 'isabela', 'juliana', 'laura', 'mariana', 'marina', 'patricia', 'rafaela', 'sabrina', 'sofia', 'valentina']);
  const maleNames = new Set(['bruno', 'carlos', 'daniel', 'davi', 'eduardo', 'felipe', 'gabriel', 'joao', 'jose', 'lucas', 'marcos', 'matheus', 'miguel', 'pedro', 'rafael', 'rodrigo', 'thiago', 'vinicius']);
  return femaleNames.has(firstName) ? 'female' : maleNames.has(firstName) ? 'male' : 'neutral';
}

function membershipStatus(item) {
  if (item.status === 'cancelled') return 'cancelled';
  return item.ends_at && String(item.ends_at).slice(0, 10) < new Date().toISOString().slice(0, 10) ? 'expired' : 'active';
}

function membershipStatusLabel(status) {
  return ({ active: 'Ativa', expired: 'Vencida', cancelled: 'Cancelada' })[status] || status;
}

function render() {
  const list = v('link-list');
  const term = (v('link-search').value || '').toLowerCase().trim();
  const plan = v('link-filter-plan').value;
  const status = v('link-filter-status').value;
  const from = v('link-filter-from').value;
  const to = v('link-filter-to').value;
  list.innerHTML = '';
  const data = links.filter((item) => {
    const currentStatus = membershipStatus(item);
    const startsAt = String(item.starts_at || '').slice(0, 10);
    const endsAt = String(item.ends_at || '').slice(0, 10);
    return (!term || `${item.member_name || ''} ${item.plan_name || ''}`.toLowerCase().includes(term))
      && (!plan || item.plan_id === plan)
      && (!status || currentStatus === status)
      && (!from || startsAt >= from)
      && (!to || endsAt <= to);
  });
  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  for (const item of data.slice((currentPage - 1) * pageSize, currentPage * pageSize)) {
    const status = membershipStatus(item);
    const tr = document.createElement('tr');
    tr.className = 'membership-row-action';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'button');
    tr.title = 'Abrir edição da matrícula';
    tr.innerHTML = `<td><span class="membership-member-name ${memberNameTone(item)}">${item.member_name || '-'}</span></td><td>${item.plan_name || '-'}</td><td>${money(item.plan_price_cents)}</td><td><span class="membership-status ${status}">${membershipStatusLabel(status)}</span></td><td class="membership-date">${dateOnly(item.starts_at)}</td><td class="membership-date">${dateOnly(item.ends_at)}</td><td></td>`;
    tr.addEventListener('click', () => openModal(item));
    tr.addEventListener('keydown', (event) => { if (event.target.closest('button')) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openModal(item); } });
    const actions = tr.lastElementChild;
    const actionRow = document.createElement('div');
    actionRow.className = 'membership-action-row';
    const editButton = window.AcademiaIcons.button('edit', 'Editar matrícula');
    editButton.addEventListener('click', (event) => { event.stopPropagation(); openModal(item); });
    actionRow.appendChild(editButton);

    const contractBtn = document.createElement('button');
    contractBtn.type = 'button';
    contractBtn.className = 'icon-button';
    contractBtn.title = 'Emitir contrato de adesão';
    contractBtn.setAttribute('aria-label', 'Emitir contrato de adesão');
    contractBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
    contractBtn.addEventListener('click', (event) => { event.stopPropagation(); openContractModal(item); });
    actionRow.appendChild(contractBtn);

    const receiptBtn = document.createElement('button');
    receiptBtn.type = 'button';
    receiptBtn.className = 'icon-button';
    receiptBtn.title = 'Emitir recibo';
    receiptBtn.setAttribute('aria-label', 'Emitir recibo');
    receiptBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>';
    receiptBtn.addEventListener('click', (event) => { event.stopPropagation(); openReceiptModal(item); });
    actionRow.appendChild(receiptBtn);

    actionRow.appendChild(mini(status === 'active' ? '⊘' : '●', (event) => { event.stopPropagation(); if (status === 'active') return cancelLink(item); }, status !== 'active'));
    actionRow.lastElementChild.className = 'icon-button';
    actionRow.lastElementChild.title = status === 'active' ? 'Cancelar matrícula' : 'Matrícula encerrada';
    actionRow.lastElementChild.setAttribute('aria-label', actionRow.lastElementChild.title);
    actions.appendChild(actionRow);
    list.appendChild(tr);
  }
  if (!list.children.length) list.innerHTML = '<tr><td colspan="7">Nenhuma matrícula corresponde aos filtros.</td></tr>';
  renderPagination(data.length, pageCount);
}

function renderPagination(total, pageCount) {
  const container = v('link-pagination');
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
  select.addEventListener('change', () => { pageSize = Number(select.value) || 10; currentPage = 1; render(); });
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
      button.onclick = () => { currentPage = page; render(); };
      controls.appendChild(button);
    }
  }
  container.append(summary, controls);
}

async function load() {
  try {
    const [linkResult, memberResult, planResult] = await Promise.all([
      call('/api/memberships'),
      call('/api/members'),
      call('/api/plans')
    ]);
    links = linkResult.data || [];
    currentPage = 1;
    members = (memberResult.data || []).filter((m) => m.status === 'active');
    plans = (planResult.data || []).filter((p) => p.is_active);
    opt(v('link-member'), members, (m) => m.name);
    opt(v('link-plan'), plans, (p) => p.name);
    const planFilter = v('link-filter-plan');
    planFilter.innerHTML = '<option value="">Todos os planos</option>';
    for (const plan of planResult.data || []) { const option = document.createElement('option'); option.value = plan.id; option.textContent = plan.name; planFilter.appendChild(option); }
    render();
    v('link-status').textContent = '';
  } catch (error) {
    if (v('link-status')) v('link-status').textContent = `Erro: ${error.message}`;
  }
}

function openModal(item = {}) {
  editingLinkId = item.id || '';
  v('link-modal-title').textContent = editingLinkId ? 'Editar matrícula' : 'Nova matrícula';
  v('link-member').value = item.member_id || '';
  v('link-member').disabled = Boolean(editingLinkId);
  v('link-plan').value = item.plan_id || '';
  v('link-start').value = String(item.starts_at || '').slice(0, 10);
  v('save-link-button').textContent = editingLinkId ? 'Salvar alterações' : 'Salvar matrícula';
  v('link-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => v('link-member').focus(), 50);
}

function closeModal() {
  v('link-modal').classList.add('hidden');
  document.body.style.overflow = '';
  v('link-form').reset();
  editingLinkId = '';
  v('link-member').disabled = false;
  v('link-modal-title').textContent = 'Nova matrícula';
  v('save-link-button').textContent = 'Salvar matrícula';
}

async function save() {
  if (!v('link-form').reportValidity()) return;
  try {
    v('save-link-button').disabled = true;
    await call(editingLinkId ? '/api/memberships/update' : '/api/memberships', {
      method: 'POST',
      body: JSON.stringify(editingLinkId
        ? { membership_id: editingLinkId, plan_id: v('link-plan').value, starts_at: v('link-start').value || undefined }
        : { member_id: v('link-member').value, plan_id: v('link-plan').value, starts_at: v('link-start').value || undefined })
    });
    v('link-start').value = '';
    closeModal();
    await load();
  } catch (error) {
    if (v('link-status')) v('link-status').textContent = `Erro ao salvar: ${error.message}`;
  } finally {
    v('save-link-button').disabled = false;
  }
}

async function cancelLink(item) {
  if (!confirm(`Cancelar matrícula de ${item.member_name}?`)) return;
  await call('/api/memberships/cancel', { method: 'POST', body: JSON.stringify({ membership_id: item.id }) });
  await load();
}

function toggleLinkFilters() {
  const panel = v('link-filter-panel');
  const hidden = panel.classList.toggle('hidden');
  v('link-filter-toggle').setAttribute('aria-expanded', String(!hidden));
  if (!hidden) setTimeout(() => v('link-search')?.focus(), 40);
}

async function openContractModal(item) {
  const modal = v('contract-modal');
  const container = v('contract-printable-container');
  if (!modal || !container) return;

  container.innerHTML = '<div style="padding: 40px; text-align: center;">Carregando dados do contrato...</div>';
  modal.classList.remove('hidden');

  let memberData = { name: item.member_name };
  let gymData = {
    name: localStorage.getItem('gymName') || 'BlueREC Academia',
    logo_url: localStorage.getItem('gymLogoUrl') || './blue-rec-logo.png'
  };

  try {
    const [memberRes, gymRes] = await Promise.all([
      call(`/api/members/detail?id=${item.member_id}`).catch(() => null),
      call('/api/gym/profile').catch(() => null)
    ]);
    if (memberRes?.member) memberData = memberRes.member;
    if (gymRes) gymData = gymRes;
  } catch (_) {}

  const logoSrc = gymData.logo_url || './blue-rec-logo.png';
  const gymName = gymData.name || 'Academia';
  const gymDoc = gymData.document_number ? `CNPJ/CPF: ${gymData.document_number}` : 'CNPJ: Regularizado';
  const gymAddress = gymData.address || 'Endereço da Academia';
  const gymPhone = gymData.phone ? `Tel/WhatsApp: ${gymData.phone}` : '';
  const gymEmail = gymData.email ? `E-mail: ${gymData.email}` : '';

  const memberName = memberData.name || item.member_name || 'Aluno';
  const memberCpf = memberData.cpf ? `CPF nº ${memberData.cpf}` : (memberData.document ? `Doc nº ${memberData.document}` : 'CPF não informado');
  const memberRg = memberData.rg ? `RG nº ${memberData.rg}` : '';
  const memberPhone = memberData.phone ? `Telefone: ${memberData.phone}` : '';
  const memberEmail = memberData.email ? `E-mail: ${memberData.email}` : '';
  const addr = memberData.address_details || {};
  const memberAddress = addr.street ? `${addr.street}, ${addr.number || 'S/N'} ${addr.neighborhood ? '- ' + addr.neighborhood : ''}, ${addr.city || ''}/${addr.state || ''}` : (memberData.address || 'Endereço não informado');

  const planName = item.plan_name || 'Plano Padrão';
  const planPrice = money(item.plan_price_cents);
  const startDate = dateOnly(item.starts_at);
  const endDate = dateOnly(item.ends_at);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  container.innerHTML = `
    <article class="contract-paper">
      <header class="contract-header">
        <img class="contract-header-logo" src="${logoSrc}" alt="Logo da ${gymName}" />
        <div class="contract-header-gym">
          <strong>${gymName}</strong>
          <div>${gymDoc}</div>
          <div>${gymAddress}</div>
          <div>${gymPhone} ${gymEmail ? '· ' + gymEmail : ''}</div>
        </div>
      </header>

      <h2 class="contract-title">Instrumento Particular de Prestação de Serviços Fitness e Termo de Adesão</h2>

      <div class="contract-parties-box">
        <strong>CONTRATADA:</strong> ${gymName}, pessoa jurídica de direito privado, sob ${gymDoc}, situada em ${gymAddress}.<br/>
        <strong>CONTRATANTE:</strong> ${memberName}, inscrito(a) no ${memberCpf} ${memberRg ? '· ' + memberRg : ''}, residente em ${memberAddress}, ${memberPhone} ${memberEmail ? '· ' + memberEmail : ''}.
      </div>

      <div class="contract-section">
        <h4>Cláusula 1ª — Do Objeto</h4>
        <p>O presente contrato tem como objeto a disponibilização dos serviços de condicionamento físico, musculação e atividades complementares da CONTRATADA ao(à) CONTRATANTE, na modalidade <strong>${planName}</strong>.</p>
        <p><strong>Vigência:</strong> Matrícula válida a partir de <strong>${startDate}</strong> até <strong>${endDate}</strong>, observados os horários de funcionamento do estabelecimento.</p>
      </div>

      <div class="contract-section">
        <h4>Cláusula 2ª — Da Mensalidade e Pagamentos</h4>
        <p>Pelos serviços contratados, o(a) CONTRATANTE obriga-se a pagar o valor de <strong>${planPrice}</strong> por ciclo contratual, mediante Pix, cartão, dinheiro ou boleto bancário.</p>
      </div>

      <div class="contract-section">
        <h4>Cláusula 3ª — Da Aptidão Física e Saúde</h4>
        <p>O(A) CONTRATANTE declara expressamente estar em perfeitas condições de saúde para a prática esportiva, responsabilizando-se civil e criminalmente pela veracidade das informações de saúde prestadas.</p>
      </div>

      <div class="contract-section">
        <h4>Cláusula 4ª — Do Acesso e Convivência</h4>
        <p>O acesso às instalações é individual e intransferível, liberado pelo totem/catraca por QR Code dinâmico ou biometria/matrícula. É obrigatório calçado fechado e respeito às normas de civilidade.</p>
      </div>

      <div style="margin-top: 24px; text-align: right; font-style: italic;">
        Localidade da Unidade, ${today}.
      </div>

      <div class="contract-signatures">
        <div class="contract-sign-line">
          <strong>${gymName}</strong><br/>
          <small>Representante Legal / Recepção</small>
        </div>
        <div class="contract-sign-line">
          <strong>${memberName}</strong><br/>
          <small>Assinatura do(a) Aluno(a)</small>
        </div>
      </div>
    </article>
  `;
}

async function openReceiptModal(item) {
  const modal = v('receipt-modal');
  const container = v('receipt-printable-container');
  if (!modal || !container) return;

  const gymName = localStorage.getItem('gymName') || 'BlueREC Academia';
  const logoSrc = localStorage.getItem('gymLogoUrl') || './blue-rec-logo.png';
  const receiptNum = `REC-${(item.id || '00000000').slice(0, 8).toUpperCase()}`;
  const planPrice = money(item.plan_price_cents);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  container.innerHTML = `
    <article class="receipt-paper">
      <div class="receipt-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${logoSrc}" alt="Logo" style="height:36px;object-fit:contain;" />
          <strong>${gymName}</strong>
        </div>
        <span style="font-weight:700;color:var(--muted);">${receiptNum}</span>
      </div>

      <h3 style="text-align:center;font-size:16px;margin:8px 0;">COMPROVANTE DE MATRÍCULA</h3>

      <div class="receipt-details">
        <div class="receipt-row"><span>Aluno(a):</span><strong>${item.member_name || '-'}</strong></div>
        <div class="receipt-row"><span>Plano:</span><strong>${item.plan_name || '-'}</strong></div>
        <div class="receipt-row"><span>Início da vigência:</span><strong>${dateOnly(item.starts_at)}</strong></div>
        <div class="receipt-row"><span>Término da vigência:</span><strong>${dateOnly(item.ends_at)}</strong></div>
        <div class="receipt-row"><span>Data de emissão:</span><strong>${today}</strong></div>
        <div class="receipt-row receipt-total"><span>Valor Total:</span><span>${planPrice}</span></div>
      </div>

      <div style="margin-top:24px;text-align:center;border-top:1px solid #cbd5e1;padding-top:12px;font-size:12px;color:#64748b;">
        <p>Recebemos a quantia supra referente à matrícula fitness.</p>
        <div style="margin-top:20px;border-top:1px dashed #94a3b8;width:60%;margin-left:auto;margin-right:auto;padding-top:4px;">
          ${gymName} · Recepção
        </div>
      </div>
    </article>
  `;

  modal.classList.remove('hidden');
}

v('print-contract-btn')?.addEventListener('click', () => window.print());
v('print-receipt-btn')?.addEventListener('click', () => window.print());
v('close-contract-modal')?.addEventListener('click', () => v('contract-modal')?.classList.add('hidden'));
v('close-receipt-modal')?.addEventListener('click', () => v('receipt-modal')?.classList.add('hidden'));
v('contract-modal')?.addEventListener('click', (e) => { if (e.target === v('contract-modal')) v('contract-modal')?.classList.add('hidden'); });
v('receipt-modal')?.addEventListener('click', (e) => { if (e.target === v('receipt-modal')) v('receipt-modal')?.classList.add('hidden'); });

v('new-link-button').onclick = openModal;
v('link-filter-toggle').onclick = toggleLinkFilters;
v('close-link-modal').onclick = closeModal;
v('cancel-link-button').onclick = closeModal;
v('link-form').addEventListener('submit', (event) => { event.preventDefault(); save(); });
v('link-search').oninput = () => { currentPage = 1; render(); };
['link-filter-plan', 'link-filter-status', 'link-filter-from', 'link-filter-to'].forEach((id) => v(id).addEventListener('change', () => { currentPage = 1; render(); }));
load();
