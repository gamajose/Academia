const host = window.location.hostname || 'localhost';
const API = localStorage.getItem('apiBaseUrl') || `http://${host}:3004`;
const TOKEN = localStorage.getItem('academiaToken') || '';
const $ = (id) => document.getElementById(id);
let rows = [];
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
  const link = document.createElement('a');
  link.href = 'https://wa.me/' + international;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Abrir WhatsApp';
  link.className = 'contact-link';
  return link;
}

function render() {
  const list = $('students-list');
  const term = val('student-search').toLowerCase();
  list.innerHTML = '';
  const filtered = rows.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''} ${item.cpf || ''} ${item.rg || ''}`.toLowerCase().includes(term));

  for (const item of filtered) {
    const pending = Number(item.pending_amount_cents || 0);
    const li = document.createElement('li');
    li.className = 'entity-card';
    const main = document.createElement('div');
    main.className = 'entity-main';
    const statusClass = item.status === 'active' ? 'ok' : 'bad';
    main.innerHTML = `
      <strong>${item.name}</strong>
      <span>${item.email || 'Sem e-mail'} · ${item.phone ? formatPhone(item.phone) : 'Sem telefone'}</span>
      <span>${item.plan_name || 'Sem plano'} · <span class="badge ${statusClass}">${item.status === 'active' ? 'Ativo' : 'Inativo'}</span> ${pending > 0 ? `<span class="badge warn">Pendente ${brl(pending)}</span>` : '<span class="badge ok">Em dia</span>'}</span>`;
    const whatsapp = whatsappLink(item.phone);
    if (whatsapp) main.appendChild(whatsapp);
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    actions.appendChild(button('Ver credencial', () => openCredentialPreview(item), 'mini-button'));
    actions.appendChild(button('Editar cadastro', () => openModal(item), 'mini-button secondary'));
    actions.appendChild(button(item.status === 'active' ? 'Desativar' : 'Ativar', () => toggle(item), 'mini-button'));
    li.append(main, actions);
    list.appendChild(li);
  }

  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Nenhum aluno encontrado.';
    list.appendChild(li);
  }
}

async function load() {
  if (!TOKEN) { location.href = './student-login.html'; return; }
  try {
    const result = await req('/api/members/detail');
    rows = result.data || [];
    render();
    $('students-status').textContent = `${rows.length} aluno(s) carregado(s).`;
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
  const emergencyName = val('student-emergency-name');
  const emergencyPhone = digits(val('student-emergency-phone'));
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
    await req('/api/members/detail/save', {
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
    $('students-status').textContent = 'Cadastro salvo com sucesso.';
  } catch (error) {
    const labels = { cpf_ja_cadastrado: 'Este CPF já pertence a outro aluno.', email_invalido: 'Informe um e-mail válido.', cpf_invalido: 'O CPF deve possuir 11 dígitos.' };
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

async function drawCredentialQr(payload) {
  const canvas = $('credential-preview-qr');
  const empty = $('credential-qr-empty');
  if (!payload || !window.QRCode?.toCanvas) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    empty.classList.remove('hidden');
    return;
  }
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
    await drawCredentialQr(dynamic.qr_payload || '');
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
$('close-student-modal').onclick = closeModal;
$('cancel-student-button').onclick = closeModal;
$('student-form').addEventListener('submit', save);
$('student-search').oninput = render;
$('student-cpf').addEventListener('input', (event) => { event.target.value = formatCpf(event.target.value); });
$('student-phone').addEventListener('input', (event) => { if (phoneWidget?.getSelectedCountryData()?.iso2 === 'br') event.target.value = formatPhone(event.target.value); });
$('student-emergency-phone').addEventListener('input', (event) => { event.target.value = formatPhone(event.target.value); });
$('student-postal-code').addEventListener('input', (event) => { event.target.value = formatCep(event.target.value); });
$('close-credential-preview').onclick = closeCredentialPreview;
$('reset-offline-pin').onclick = resetOfflinePin;
$('credential-preview-modal').addEventListener('click', (event) => {
  if (event.target === $('credential-preview-modal')) closeCredentialPreview();
});
AcademiaRichEditor.initAll().catch((error) => { $('students-status').textContent = error.message; });
initPhoneWidget();
load();
