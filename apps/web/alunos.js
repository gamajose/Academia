const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const TOKEN = localStorage.getItem('academiaToken') || '';
const $ = (id) => document.getElementById(id);
let rows = [];
let currentPage = 1;
let pageSize = 10;
let phoneWidget = null;
let credentialMemberId = '';
let credentialExpiresAt = null;
let credentialTimer = null;
let credentialRequestInFlight = false;
let credentialTtlSeconds = 30;

async function req(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'erro_requisicao');
  return data;
}

const digits = (value) => String(value || '').replace(/\D/g, '');
const fieldValue = (id) => {
  const element = $(id);
  if (!element) return '';
  if (element.classList.contains('rich-editor') && window.AcademiaRichEditor) return window.AcademiaRichEditor.getValue(id);
  return element.isContentEditable ? element.innerHTML.trim() : element.value.trim();
};
const val = (id) => fieldValue(id);
const brl = (value) => (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatCpf(value) {
  const number = digits(value).slice(0, 11);
  return number.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatPhone(value) {
  const number = digits(value).slice(0, 11);
  if (number.length <= 10) return number.replace(/^(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, a, b) => [ddd ? `(${ddd})` : '', a, b].filter(Boolean).join(' '));
  return number.replace(/^(\d{2})(\d)(\d{0,4})(\d{0,4})/, (_, ddd, nine, a, b) => `(${ddd}) ${nine} ${a}${b ? `-${b}` : ''}`.trim());
}

function formatCep(value) {
  return digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

function formatDynamicCode(value) {
  const number = digits(value).slice(0, 6);
  return number.length === 6 ? `${number.slice(0, 3)} ${number.slice(3)}` : '--- ---';
}

function button(text, action, className = 'mini-button') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.onclick = action;
  return element;
}

function whatsappLink(phone) {
  const number = digits(phone);
  if (!number) return null;
  const international = (number.length <= 11 ? '55' : '') + number;
  const link = window.AcademiaIcons?.link('whatsapp', 'Abrir conversa no WhatsApp', 'contact-link whatsapp-contact') || document.createElement('a');
  link.href = 'https://wa.me/' + international;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function plainText(value) {
  const holder = document.createElement('div');
  holder.innerHTML = value || '';
  return holder.textContent?.trim() || 'Não informado';
}

function dateOnly(value) {
  if (!value) return '-';
  const parts = String(value).slice(0, 10).split('-').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('pt-BR') : String(value);
}

function assessmentAge(value) {
  if (!value) return 'Nunca avaliado';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return `${Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))} dias atrás`;
}

function openStudentViewModal() {
  $('student-view-modal').classList.remove('hidden');
  $('student-view-modal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeStudentViewModal() {
  $('student-view-modal').classList.add('hidden');
  $('student-view-modal').setAttribute('aria-hidden', 'true');
  if ($('student-form-panel').classList.contains('hidden') && $('credential-preview-modal').classList.contains('hidden')) document.body.classList.remove('modal-open');
}

async function openStudentView(item) {
  $('student-view-name').textContent = item.name || 'Aluno';
  $('student-view-contact').textContent = [item.email, item.phone ? formatPhone(item.phone) : ''].filter(Boolean).join(' · ') || 'Sem contato informado';
  $('student-view-status').textContent = item.status === 'active' ? 'Ativo' : 'Inativo';
  $('student-view-plan').textContent = item.plan_name || 'Sem plano ativo';
  $('student-view-training').textContent = item.training_plan_name ? `${item.training_plan_name} · ${item.training_exercise_count || 0} exercício(s) · ${item.training_plan_age_days || 0} dias` : 'Sem ficha ativa';
  $('student-view-assessment-age').textContent = item.latest_assessment_date ? `${dateOnly(item.latest_assessment_date)} · ${assessmentAge(item.latest_assessment_date)}` : 'Nunca avaliado';
  $('student-view-objective').textContent = plainText(item.objective);
  $('student-view-allergies').textContent = plainText(item.allergies);
  $('student-view-medical').textContent = plainText(item.medical_notes);
  $('student-view-notes').textContent = plainText(item.notes);
  const photo = $('student-view-photo');
  photo.hidden = !item.photo_url;
  photo.src = item.photo_url || '';
  $('student-view-photo-empty').hidden = Boolean(item.photo_url);
  $('student-view-exercises').innerHTML = '<li class="empty-state">Carregando ficha...</li>';
  $('student-view-assessments').innerHTML = '<li class="empty-state">Carregando avaliações...</li>';
  openStudentViewModal();
  try {
    const [assessmentResult, goalResult, trainingResult] = await Promise.all([
      req(`/api/assessments?member_id=${encodeURIComponent(item.id)}`),
      req(`/api/goals?member_id=${encodeURIComponent(item.id)}`),
      item.training_plan_id ? req(`/api/training/plans/detail?plan_id=${encodeURIComponent(item.training_plan_id)}`) : Promise.resolve({ exercises: [] })
    ]);
    const exerciseList = $('student-view-exercises');
    exerciseList.innerHTML = '';
    for (const exercise of trainingResult.exercises || []) {
      const row = document.createElement('li');
      row.className = 'student-view-assessment-row';
      const name = document.createElement('strong'); name.textContent = exercise.exercise_name || 'Exercício';
      const details = document.createElement('span'); details.textContent = `${exercise.day_title || 'Treino'} · ${exercise.sets || '-'} séries · ${exercise.reps || '-'} repetições`;
      row.append(name, details); exerciseList.appendChild(row);
    }
    if (!exerciseList.children.length) exerciseList.innerHTML = '<li class="empty-state">Nenhum exercício em ficha ativa.</li>';
    const list = $('student-view-assessments');
    list.innerHTML = '';
    const assessments = assessmentResult.data || [];
    for (const assessment of assessments.slice(0, 8)) {
      const row = document.createElement('li');
      row.className = 'student-view-assessment-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `Avaliação em ${new Date(`${String(assessment.assessment_date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}`;
      const summary = document.createElement('span');
      summary.textContent = `Peso: ${assessment.weight_kg ?? '-'} kg · Gordura: ${assessment.body_fat_percent ?? '-'}% · Cintura: ${assessment.waist_cm ?? '-'} cm`;
      copy.append(title, summary);
      row.appendChild(copy);
      if (assessment.photo_url) { const image = document.createElement('img'); image.src = assessment.photo_url; image.alt = ''; image.loading = 'lazy'; row.appendChild(image); }
      list.appendChild(row);
    }
    if (!list.children.length) list.innerHTML = '<li class="empty-state">Nenhuma avaliação registrada.</li>';
    const goals = goalResult.data || [];
    $('student-view-goals').textContent = goals.length ? goals.map((goal) => `${goal.goal_type}: ${goal.target_value ?? '-'}${goal.target_date ? ` até ${new Date(`${String(goal.target_date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}`).join(' · ') : 'Nenhuma meta cadastrada.';
  } catch (error) {
    $('student-view-assessments').innerHTML = `<li class="empty-state">Não foi possível carregar o histórico: ${error.message}</li>`;
  }
}

function render() {
  const list = $('students-list');
  const term = val('student-search').toLowerCase();
  list.innerHTML = '';
  const filtered = rows.filter((item) => {
    return `${item.name} ${item.email || ''} ${item.phone || ''} ${item.cpf || ''} ${item.rg || ''}`.toLowerCase().includes(term);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleRows = filtered.slice(start, start + pageSize);

  for (const item of visibleRows) {
    const pending = Number(item.pending_amount_cents || 0);
    const li = document.createElement('li');
    li.className = 'entity-card';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Visualizar cadastro de ${item.name}`);
    li.addEventListener('click', () => openStudentView(item));
    li.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudentView(item); } });
    const main = document.createElement('div');
    main.className = 'entity-main';
    const statusClass = item.status === 'active' ? 'ok' : 'bad';
    main.innerHTML = `
      <strong>${item.name}</strong>
      <span>E-mail: ${item.email || 'Sem e-mail'} · Tel: ${item.phone ? formatPhone(item.phone) : 'Sem telefone'}</span>
      <span class="student-card-tags"><span>${item.plan_name || 'Sem plano'}</span><span class="badge ${statusClass}">${item.status === 'active' ? 'Ativo' : 'Inativo'}</span> ${pending > 0 ? `<span class="badge warn">Pendente ${brl(pending)}</span>` : '<span class="badge ok">Em dia</span>'}<span class="student-info-chip ${item.training_plan_id ? 'has-content' : 'empty-content'}">${item.training_plan_id ? `Ficha ativa · ${item.training_exercise_count || 0} exercício(s)` : 'Sem ficha ativa'}</span><span class="student-info-chip ${item.latest_assessment_date ? 'has-history' : 'empty-content'}">${item.latest_assessment_date ? `Histórico desde ${dateOnly(item.latest_assessment_date)}` : 'Sem histórico de avaliação'}</span></span>`;
    const whatsapp = whatsappLink(item.phone);
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    if (whatsapp) { whatsapp.addEventListener('click', (event) => event.stopPropagation()); actions.appendChild(whatsapp); }
    const credentialButton = window.AcademiaIcons.button('qr', 'Abrir QR Code e credencial');
    credentialButton.addEventListener('click', (event) => { event.stopPropagation(); openCredentialPreview(item); });
    actions.appendChild(credentialButton);
    const editButton = window.AcademiaIcons.button('edit', 'Editar cadastro');
    editButton.addEventListener('click', (event) => { event.stopPropagation(); openModal(item); });
    actions.appendChild(editButton);
    actions.appendChild(button(item.status === 'active' ? '⊘' : '●', (event) => { event?.stopPropagation?.(); toggle(item); }, 'icon-button'));
    actions.lastElementChild.title = item.status === 'active' ? 'Desativar aluno' : 'Ativar aluno'; actions.lastElementChild.setAttribute('aria-label', actions.lastElementChild.title);
    li.append(main, actions);
    list.appendChild(li);
  }

  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Nenhum aluno encontrado.';
    list.appendChild(li);
  }
  $('student-count').textContent = filtered.length
    ? (filtered.length <= pageSize ? `${filtered.length} de ${rows.length} aluno(s)` : `${start + 1}-${Math.min(start + pageSize, filtered.length)} de ${filtered.length} aluno(s)`)
    : `0 de ${rows.length} aluno(s)`;
  renderPagination(filtered.length, totalPages);
}

function renderPagination(totalItems, totalPages) {
  const pagination = $('student-pagination');
  pagination.innerHTML = '';
  if (!totalItems) return;
  const pageSizeField = document.createElement('label');
  pageSizeField.className = 'student-page-size';
  pageSizeField.innerHTML = '<span>Por página</span><select aria-label="Alunos por página"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select>';
  const select = pageSizeField.querySelector('select');
  select.value = String(pageSize);
  select.addEventListener('change', () => { pageSize = Number(select.value) || 10; currentPage = 1; render(); });
  pagination.appendChild(pageSizeField);
  if (totalPages <= 1) return;
  const pages = document.createElement('div');
  pages.className = 'student-page-buttons';
  for (let page = 1; page <= totalPages; page += 1) {
    const pageButton = document.createElement('button');
    pageButton.type = 'button';
    pageButton.className = `mini-button ${page === currentPage ? 'current' : 'secondary'}`;
    pageButton.textContent = String(page);
    pageButton.setAttribute('aria-label', `Página ${page}`);
    pageButton.setAttribute('aria-current', page === currentPage ? 'page' : 'false');
    pageButton.addEventListener('click', () => { currentPage = page; render(); });
    pages.appendChild(pageButton);
  }
  pagination.appendChild(pages);
}

async function load() {
  if (!TOKEN) { location.href = './student-login.html'; return; }
  try {
    const result = await req('/api/members/detail');
    rows = result.data || [];
    currentPage = 1;
    render();
    $('students-status').textContent = '';
  } catch (error) {
    $('students-status').textContent = `Erro: ${error.message}`;
  }
}

function setValue(id, value) {
  const element = $(id);
  if (!element) return;
  if (element.classList.contains('rich-editor') && window.AcademiaRichEditor) {
    window.AcademiaRichEditor.setValue(id, value);
    return;
  }
  if (element.isContentEditable) element.innerHTML = value || '';
  else element.value = value ?? '';
}

function initPhoneWidget() {
  if (!window.intlTelInput || !$('student-phone')) return;
  phoneWidget = window.intlTelInput($('student-phone'), {
    initialCountry: 'br',
    preferredCountries: ['br', 'pt', 'us'],
    separateDialCode: true,
    nationalMode: true,
    showSelectedDialCode: true,
    autoPlaceholder: 'aggressive',
    formatAsYouType: true,
    utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.1/build/js/utils.js'
  });
}

function phoneCountryCode() {
  const dialCode = phoneWidget?.getSelectedCountryData()?.dialCode;
  return dialCode ? `+${dialCode}` : '+55';
}

function validatePhoneField(value, countryCode) {
  const number = digits(value);
  if (!number) return '';
  if (countryCode === '+55' && number.length !== 11) return 'O telefone do Brasil deve ter exatamente 11 dígitos.';
  if (countryCode !== '+55' && (number.length < 6 || number.length > 15)) return 'Informe um telefone válido para o país selecionado.';
  return '';
}

function selectPhoneCountry(countryCode) {
  if (!phoneWidget) return;
  const normalized = String(countryCode || '+55').replace(/\D/g, '');
  const countryData = phoneWidget.getCountryData?.()
    || window.intlTelInput.getCountryData?.()
    || window.intlTelInputGlobals?.getCountryData?.()
    || [];
  const country = countryData.find((item) => item.dialCode === normalized);
  phoneWidget.setCountry(country?.iso2 || 'br');
}

function openModal(item = {}) {
  $('student-form-panel').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setValue('student-id', item.id);
  setValue('student-name', item.name);
  setValue('student-cpf', item.cpf ? formatCpf(item.cpf) : '');
  setValue('student-rg', item.rg || item.document);
  setValue('student-email', item.email);
  setValue('student-birth', item.birth_date ? String(item.birth_date).slice(0, 10) : '');
  const countryCode = item.phone_country_code || '+55';
  selectPhoneCountry(countryCode);
  setValue('student-phone', countryCode === '+55' ? formatPhone(item.phone) : item.phone);
  setValue('student-emergency-name', item.emergency_contact_name || (item.emergency_contact || '').split('|')[0]?.trim());
  setValue('student-emergency-phone', item.emergency_contact_phone || (item.emergency_contact || '').split('|')[1]?.trim());
  setValue('student-postal-code', formatCep(item.postal_code));
  setValue('student-street', item.street);
  setValue('student-address-number', item.address_number);
  setValue('student-address-complement', item.address_complement);
  setValue('student-neighborhood', item.neighborhood);
  setValue('student-city', item.city);
  setValue('student-state', item.state);
  setValue('student-country', item.country || 'Brasil');
  const richIds = ['student-objective', 'student-allergies', 'student-medical', 'student-nutrition', 'student-notes'];
  AcademiaRichEditor.setScope(richIds, `member:${item.id || 'new'}`);
  setValue('student-objective', item.objective, { preserveDraft: true });
  setValue('student-allergies', item.allergies, { preserveDraft: true });
  setValue('student-medical', item.medical_notes, { preserveDraft: true });
  setValue('student-nutrition', item.nutrition_notes, { preserveDraft: true });
  setValue('student-notes', item.notes, { preserveDraft: true });
  AcademiaRichEditor.restoreDraft(richIds);
  setTimeout(() => $('student-name').focus(), 50);
}

function closeModal() {
  $('student-form-panel').classList.add('hidden');
  document.body.style.overflow = '';
  $('student-form').reset();
  setValue('student-country', 'Brasil');
  ['student-objective', 'student-allergies', 'student-medical', 'student-nutrition', 'student-notes'].forEach((id) => AcademiaRichEditor.clearValue(id));
  selectPhoneCountry('+55');
}

function structuredAddress() {
  const parts = [
    [val('student-street'), val('student-address-number')].filter(Boolean).join(', '),
    val('student-address-complement'), val('student-neighborhood'),
    [val('student-city'), val('student-state')].filter(Boolean).join(' - '),
    formatCep(val('student-postal-code')), val('student-country')
  ].filter(Boolean);
  return parts.join(' | ');
}

async function save(event) {
  event.preventDefault();
  const email = val('student-email');
  const cpf = digits(val('student-cpf'));
  if (!val('student-name')) { $('students-status').textContent = 'Informe o nome completo.'; $('student-name').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('students-status').textContent = 'Informe um e-mail válido.'; $('student-email').focus(); return; }
  if (cpf && cpf.length !== 11) { $('students-status').textContent = 'O CPF deve possuir 11 dígitos.'; $('student-cpf').focus(); return; }

  const countryCode = phoneCountryCode();
  const phoneError = validatePhoneField(val('student-phone'), countryCode);
  if (phoneError) { $('students-status').textContent = phoneError; $('student-phone').focus(); return; }
  const emergencyName = val('student-emergency-name');
  const emergencyPhone = digits(val('student-emergency-phone'));
  if (emergencyPhone && emergencyPhone.length !== 11) { $('students-status').textContent = 'O telefone de emergência deve ter 11 dígitos no Brasil.'; $('student-emergency-phone').focus(); return; }
  const richIds = ['student-objective', 'student-allergies', 'student-medical', 'student-nutrition', 'student-notes'];
  let richValues;
  try {
    richValues = await AcademiaRichEditor.prepare(richIds);
  } catch (error) {
    $('students-status').textContent = error.message;
    return;
  }

  try {
    $('save-student-button').disabled = true;
    const saved = await req('/api/members/detail/save', {
      method: 'POST',
      body: JSON.stringify({
        member_id: val('student-id') || undefined,
        name: val('student-name'), cpf: cpf || null, rg: val('student-rg') || null,
        document: val('student-rg') || cpf || null, email: email || null,
        phone_country_code: countryCode || null, phone: digits(val('student-phone')) || null,
        birth_date: val('student-birth') || null,
        emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null,
        emergency_contact: [emergencyName, emergencyPhone].filter(Boolean).join(' | ') || null,
        postal_code: digits(val('student-postal-code')) || null, street: val('student-street') || null,
        address_number: val('student-address-number') || null, address_complement: val('student-address-complement') || null,
        neighborhood: val('student-neighborhood') || null, city: val('student-city') || null,
        state: val('student-state') || null, country: val('student-country') || 'Brasil',
        address: structuredAddress() || null, objective: richValues['student-objective'] || null,
        allergies: richValues['student-allergies'] || null, medical_notes: richValues['student-medical'] || null,
        nutrition_notes: richValues['student-nutrition'] || null, notes: richValues['student-notes'] || null
      })
    });
    AcademiaRichEditor.markSaved(richIds);
    closeModal();
    await load();
    const access = saved.student_access;
    if (access?.account_created) {
      const emailState = access.email_delivery === 'sent'
        ? 'As credenciais foram enviadas por e-mail.'
        : 'O envio automático de e-mail está pendente; confirme a configuração de e-mail.';
      $('students-status').textContent = `Cadastro salvo. Acesso criado: ${access.account_email} · senha inicial ${access.initial_password}. No primeiro login, o aluno deverá trocar a senha. ${emailState}`;
    } else if (access?.error === 'email_ja_vinculado_a_outro_aluno') {
      $('students-status').textContent = 'Cadastro salvo, mas o e-mail já está vinculado a outro aluno. Use outro e-mail para criar o acesso web.';
    } else if (!access?.account_email) {
      $('students-status').textContent = 'Cadastro salvo. Informe um e-mail para criar o acesso web com a senha inicial.';
    } else {
      $('students-status').textContent = 'Cadastro salvo com sucesso.';
    }
  } catch (error) {
    const labels = { cpf_ja_cadastrado: 'Este CPF já pertence a outro aluno.', email_invalido: 'Informe um e-mail válido.', cpf_invalido: 'O CPF deve possuir 11 dígitos.', telefone_invalido: 'O telefone precisa ter a quantidade correta de dígitos.' };
    $('students-status').textContent = labels[error.message] || `Erro ao salvar: ${error.message}`;
  } finally {
    $('save-student-button').disabled = false;
  }
}

async function toggle(item) {
  try {
    await req(item.status === 'active' ? '/api/members/deactivate' : '/api/members/activate', { method: 'POST', body: JSON.stringify({ member_id: item.id }) });
    await load();
  } catch (error) { $('students-status').textContent = `Erro: ${error.message}`; }
}

function credentialRemainingSeconds() {
  if (!credentialExpiresAt) return 0;
  return Math.max(0, Math.ceil((credentialExpiresAt.getTime() - Date.now()) / 1000));
}

function updateCredentialCountdown() {
  const remaining = credentialRemainingSeconds();
  $('credential-countdown').textContent = credentialExpiresAt ? `Muda em ${remaining} segundo(s)` : 'Credencial temporária indisponível';
  const ratio = credentialTtlSeconds > 0 ? Math.min(1, Math.max(0, remaining / credentialTtlSeconds)) : 0;
  $('credential-progress-bar').style.width = `${ratio * 100}%`;
  if (credentialExpiresAt && remaining <= 2 && credentialMemberId && !credentialRequestInFlight && !$('credential-preview-modal').classList.contains('hidden')) {
    void loadCredentialPreview({ silent: true });
  }
}

function setCredentialAccessState(access = {}) {
  const allowed = access.allowed === true;
  const dot = $('credential-state-dot');
  dot.classList.toggle('allowed', allowed);
  dot.classList.toggle('blocked', !allowed);
  $('credential-state-label').textContent = allowed ? 'Acesso liberado' : 'Acesso bloqueado';
}

async function drawCredentialQr(payload, dataUrl = '') {
  const canvas = $('credential-preview-qr');
  const empty = $('credential-qr-empty');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (dataUrl) {
    await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(); }; image.onerror = reject; image.src = dataUrl; });
    empty.classList.add('hidden');
    return;
  }
  if (!payload || !window.QRCode?.toCanvas) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  await window.QRCode.toCanvas(canvas, payload, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#111111', light: '#ffffff' }
  });
}

async function loadCredentialPreview({ silent = false } = {}) {
  if (!credentialMemberId || credentialRequestInFlight) return;
  credentialRequestInFlight = true;
  if (!silent) $('credential-preview-status').textContent = 'Gerando credencial segura...';
  try {
    const result = await req('/api/access/member-credential/preview', {
      method: 'POST',
      body: JSON.stringify({ member_id: credentialMemberId })
    });
    const dynamic = result.dynamic || {};
    const offline = result.offline || {};
    const access = result.access || {};
    const member = result.member || {};

    $('credential-student-name').textContent = member.name || 'Aluno';
    $('credential-preview-subtitle').textContent = `Prévia real da credencial de ${member.name || 'aluno'}.`;
    $('offline-registration-number').textContent = offline.registration_number || '------';
    $('offline-pin').textContent = offline.pin || '----';
    $('credential-dynamic-code').textContent = formatDynamicCode(dynamic.access_code);
    credentialExpiresAt = dynamic.expires_at ? new Date(dynamic.expires_at) : null;
    credentialTtlSeconds = Number(dynamic.ttl_seconds || 30);
    setCredentialAccessState(access);
    await drawCredentialQr(dynamic.qr_payload || '', dynamic.qr_data_url || '');
    $('credential-preview-status').textContent = access.allowed
      ? 'QR e código temporário ativos. Matrícula e PIN funcionam mesmo sem internet no celular.'
      : (access.message || 'O acesso deste aluno está bloqueado.');
    updateCredentialCountdown();
  } catch (error) {
    credentialExpiresAt = null;
    $('credential-preview-status').textContent = `Erro: ${error.message}`;
    $('credential-dynamic-code').textContent = '--- ---';
    await drawCredentialQr('');
  } finally {
    credentialRequestInFlight = false;
  }
}

function openCredentialPreview(item) {
  credentialMemberId = item.id;
  credentialExpiresAt = null;
  $('credential-preview-modal').classList.remove('hidden');
  $('credential-preview-modal').setAttribute('aria-hidden', 'false');
  $('credential-student-name').textContent = item.name || 'Aluno';
  $('credential-preview-subtitle').textContent = `Carregando a credencial de ${item.name || 'aluno'}...`;
  $('offline-registration-number').textContent = '------';
  $('offline-pin').textContent = '----';
  $('credential-dynamic-code').textContent = '--- ---';
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  if (credentialTimer) window.clearInterval(credentialTimer);
  credentialTimer = window.setInterval(updateCredentialCountdown, 1000);
  void loadCredentialPreview();
}

function closeCredentialPreview() {
  credentialMemberId = '';
  credentialExpiresAt = null;
  $('credential-preview-modal').classList.add('hidden');
  $('credential-preview-modal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  if (credentialTimer) window.clearInterval(credentialTimer);
  credentialTimer = null;
}

async function resetOfflinePin() {
  if (!credentialMemberId) return;
  const confirmed = window.confirm('Gerar um novo PIN de 4 dígitos? O PIN anterior deixará de funcionar imediatamente.');
  if (!confirmed) return;
  const buttonElement = $('reset-offline-pin');
  buttonElement.disabled = true;
  try {
    const result = await req('/api/access/member-offline-pin/reset', {
      method: 'POST',
      body: JSON.stringify({ member_id: credentialMemberId })
    });
    $('offline-registration-number').textContent = result.registration_number || '------';
    $('offline-pin').textContent = result.pin || '----';
    $('credential-preview-status').textContent = 'Novo PIN gerado. Oriente o aluno a atualizar o código salvo no celular.';
  } catch (error) {
    $('credential-preview-status').textContent = `Erro: ${error.message}`;
  } finally {
    buttonElement.disabled = false;
  }
}

$('new-student-button').onclick = () => openModal();
$('student-search-toggle').onclick = () => {
  const wrapper = $('student-search-wrap');
  const isHidden = wrapper.classList.toggle('hidden');
  if (!isHidden) $('student-search').focus();
};
$('close-student-modal').onclick = closeModal;
$('close-student-view-modal').onclick = closeStudentViewModal;
$('cancel-student-button').onclick = closeModal;
$('student-form').addEventListener('submit', save);
$('student-search').oninput = () => { currentPage = 1; render(); };
$('student-cpf').addEventListener('input', (event) => { event.target.value = formatCpf(event.target.value); });
$('student-phone').addEventListener('input', (event) => { if (phoneWidget?.getSelectedCountryData()?.iso2 === 'br') event.target.value = formatPhone(event.target.value); });
$('student-emergency-phone').addEventListener('input', (event) => { event.target.value = formatPhone(event.target.value); });
$('student-postal-code').addEventListener('input', (event) => { event.target.value = formatCep(event.target.value); });
$('close-credential-preview').onclick = closeCredentialPreview;
$('reset-offline-pin').onclick = resetOfflinePin;
$('credential-preview-modal').addEventListener('click', (event) => {
  if (event.target === $('credential-preview-modal')) closeCredentialPreview();
});
$('student-view-modal').addEventListener('click', (event) => {
  if (event.target === $('student-view-modal')) closeStudentViewModal();
});
AcademiaRichEditor.initAll().catch((error) => { $('students-status').textContent = error.message; });
initPhoneWidget();
load();
